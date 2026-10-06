import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  MusicBrainzClient,
  MusicBrainzNotFoundError,
  MusicBrainzUnavailableError,
} from './musicbrainz/musicbrainz.client.js';
import { dedupeRecordings, mapRecording, type MappedRecording, type SearchResult } from './musicbrainz/mapping.js';
import { normalizeQuery, tokenize } from './musicbrainz/query.js';
import { TtlCache } from './ttl-cache.js';

export const MIN_QUERY_LENGTH = 2;
// Up to 50 songs; searching an artist ("migos") needs room for their catalog.
const MAX_RESULTS = 50;
const HOUR = 60 * 60 * 1000;
const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SearchResponse {
  results: SearchResult[];
  /** True when MusicBrainz couldn't be reached and results came from AUX's own database. */
  usedFallback: boolean;
}

@Injectable()
export class SongsService {
  private readonly log = new Logger(SongsService.name);
  /** normalized query -> results in order (already deduped and mapped) */
  private readonly searches = new TtlCache<MappedRecording[]>(24 * HOUR, 1_000);
  /** recording id -> mapped recording; lets /resolve skip a second MusicBrainz call */
  private readonly recordings = new TtlCache<MappedRecording>(24 * HOUR, 5_000);
  /** searches already waiting on MusicBrainz, so identical ones share one request */
  private readonly inFlight = new Map<string, Promise<MappedRecording[]>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mb: MusicBrainzClient,
  ) {}

  async search(raw: string | undefined): Promise<SearchResponse> {
    const key = normalizeQuery(raw ?? '');
    if (key.replace(/ /g, '').length < MIN_QUERY_LENGTH) return { results: [], usedFallback: false };

    let mapped: MappedRecording[];
    try {
      mapped = this.searches.get(key) ?? (await this.fetchSearch(key));
    } catch (err) {
      if (!(err instanceof MusicBrainzUnavailableError)) throw err;
      this.log.warn(`Search "${key}" fell back to the local database: ${err.message}`);
      return { results: await this.searchLocal(key), usedFallback: true };
    }

    // Copies, so setting songId never mutates the cached objects.
    const results = mapped.map(m => ({ ...m.result }));
    await this.attachSongIds(results);
    return { results, usedFallback: false };
  }

  private fetchSearch(key: string): Promise<MappedRecording[]> {
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const request = this.mb
      .searchRecordings(key)
      .then(recs => {
        const mapped = dedupeRecordings(recs, MAX_RESULTS, key);
        for (const m of mapped) this.recordings.set(m.result.externalId, m);
        this.searches.set(key, mapped);
        return mapped;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }

  /** Marks results that already exist as AUX songs so the app can link them. */
  private async attachSongIds(results: SearchResult[]): Promise<void> {
    if (!results.length) return;
    try {
      const songs = await this.prisma.song.findMany({
        where: { source: 'musicbrainz', externalId: { in: results.map(r => r.externalId) } },
        select: { id: true, externalId: true },
      });
      const byExternal = new Map(songs.map(s => [s.externalId, s.id]));
      for (const r of results) r.songId = byExternal.get(r.externalId) ?? null;
    } catch (err) {
      // Search still works without the database; results just won't link.
      this.log.warn(`Couldn't look up existing songs: ${(err as Error).message}`);
    }
  }

  /** Songs AUX users have already ranked/saved whose title or artist contains every word. */
  private async searchLocal(key: string): Promise<SearchResult[]> {
    const words = tokenize(key);
    try {
      const songs = await this.prisma.song.findMany({
        where: {
          AND: words.map(w => ({
            OR: [
              { title: { contains: w, mode: 'insensitive' as const } },
              { artist: { contains: w, mode: 'insensitive' as const } },
            ],
          })),
        },
        include: { album: { select: { title: true } } },
        orderBy: { rankings: { _count: 'desc' } },
        take: MAX_RESULTS,
      });
      return songs.map(s => ({
        source: s.source,
        externalId: s.externalId,
        title: s.title,
        artist: s.artist,
        album: s.album?.title ?? null,
        releaseYear: s.releaseYear,
        durationMs: s.durationMs,
        isrc: s.isrc,
        artworkUrl: s.artworkUrl,
        externalUrl: s.externalUrl,
        songId: s.id,
      }));
    } catch (err) {
      this.log.error(`Local search failed too: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Search is unavailable right now. Try again in a moment.');
    }
  }

  /** Creates (or finds) the canonical AUX song for a catalog song. */
  async resolve(source: unknown, externalId: unknown): Promise<{ id: string }> {
    if (source === 'spotify') {
      throw new NotImplementedException('Spotify songs are not supported yet.');
    }
    if (source !== 'musicbrainz') {
      throw new BadRequestException('source must be "musicbrainz" or "spotify"');
    }
    if (typeof externalId !== 'string' || !MBID.test(externalId)) {
      throw new BadRequestException('externalId must be a MusicBrainz recording id (a UUID)');
    }
    const mbid = externalId.toLowerCase();

    const existing = await this.prisma.song.findUnique({
      where: { source_externalId: { source: 'musicbrainz', externalId: mbid } },
      select: { id: true },
    });
    if (existing) return existing;

    const mapped = this.recordings.get(mbid) ?? (await this.lookup(mbid));
    const { result, releaseGroup } = mapped;

    let albumId: string | null = null;
    if (releaseGroup) {
      const album = await this.prisma.album.upsert({
        where: { source_externalId: { source: 'musicbrainz', externalId: releaseGroup.id } },
        create: {
          source: 'musicbrainz',
          externalId: releaseGroup.id,
          title: releaseGroup.title,
          artist: result.artist,
          releaseYear: releaseGroup.releaseYear,
          artworkUrl: releaseGroup.artworkUrl,
          externalUrl: releaseGroup.externalUrl,
        },
        update: {},
        select: { id: true },
      });
      albumId = album.id;
    }

    // upsert: two users acting on the same new song at once both get one row.
    return this.prisma.song.upsert({
      where: { source_externalId: { source: 'musicbrainz', externalId: mbid } },
      create: {
        source: 'musicbrainz',
        externalId: mbid,
        title: result.title,
        artist: result.artist,
        albumId,
        releaseYear: result.releaseYear,
        durationMs: result.durationMs,
        isrc: result.isrc,
        artworkUrl: result.artworkUrl,
        externalUrl: result.externalUrl,
      },
      update: {},
      select: { id: true },
    });
  }

  private async lookup(mbid: string): Promise<MappedRecording> {
    try {
      const mapped = mapRecording(await this.mb.lookupRecording(mbid));
      this.recordings.set(mbid, mapped);
      return mapped;
    } catch (err) {
      if (err instanceof MusicBrainzNotFoundError) {
        throw new NotFoundException('That song does not exist on MusicBrainz.');
      }
      if (err instanceof MusicBrainzUnavailableError) {
        throw new ServiceUnavailableException('MusicBrainz is busy. Try again in a moment.');
      }
      throw err;
    }
  }
}
