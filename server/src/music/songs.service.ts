import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AppleMusicClient,
  AppleMusicNotFoundError,
  AppleMusicUnavailableError,
} from './apple/apple-music.client.js';
import {
  dedupeAppleSongs,
  mapAppleAlbum,
  mapAppleSong,
  previewUrl,
  type MappedAppleSong,
} from './apple/apple-music.mapping.js';
import type { AmSong } from './apple/apple-music.types.js';
import type { AlbumResult, SearchResult } from './catalog.js';
import {
  MusicBrainzClient,
  MusicBrainzNotFoundError,
  MusicBrainzUnavailableError,
} from './musicbrainz/musicbrainz.client.js';
import { dedupeRecordings, mapRecording, type MappedRecording } from './musicbrainz/mapping.js';
import { normalizeQuery, tokenize } from './musicbrainz/query.js';
import { pickMatch, searchTextFor } from './playlists/match.js';
import { parsePlaylistLink } from './playlists/playlist-link.js';
import {
  SpotifyEmbedClient,
  SpotifyEmbedUnavailableError,
  SpotifyPlaylistNotFoundError,
  type PlaylistEntry,
} from './playlists/spotify-embed.js';
import { TtlCache } from './ttl-cache.js';

export const MIN_QUERY_LENGTH = 2;
// Up to 50 songs; searching an artist ("migos") needs room for their catalog.
const MAX_RESULTS = 50;
const HOUR = 60 * 60 * 1000;
const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APPLE_ID = /^\d{1,20}$/;
const GENRE_ID = /^\d{1,6}$/;
/** CC-XXX-YY-NNNNN without dashes, e.g. USUM71607007. */
const ISRC = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

export interface SearchResponse {
  results: SearchResult[];
  /** Albums matching the search. Only Apple Music searches albums, so empty after a fallback. */
  albums: AlbumResult[];
  /** True when no catalog could be reached and results came from AUX's own database. */
  usedFallback: boolean;
}

export interface PreviewResponse {
  /** A 30-second clip to stream, or null when Apple Music has none for this song. */
  url: string | null;
}

export interface AlbumResponse {
  album: AlbumResult;
  tracks: SearchResult[];
}

export interface ChartsResponse {
  /** Most played first. */
  songs: SearchResult[];
  albums: AlbumResult[];
}

export interface PlaylistImportResponse {
  /** The playlist's name, as the source app shows it. */
  name: string;
  provider: 'apple' | 'spotify';
  /** Playlist order, one entry per song (duplicates removed). */
  tracks: SearchResult[];
  /** Songs from the playlist AUX couldn't find in its catalog. */
  unmatched: PlaylistEntry[];
  /** True when the playlist was longer than AUX reads in one import. */
  truncated: boolean;
}

/** The most Spotify playlist songs matched in one import (each is a catalog search). */
const SPOTIFY_IMPORT_LIMIT = 150;
/** Catalog searches run at once while matching a Spotify playlist. */
const MATCH_CONCURRENCY = 4;

interface AppleSearch {
  songs: MappedAppleSong[];
  albums: AlbumResult[];
}

/**
 * Search tries Apple Music first (best matches and most popular songs first),
 * then MusicBrainz, then songs already in AUX's database, so search keeps
 * working when a catalog is down or this server has no Apple Music key.
 */
@Injectable()
export class SongsService {
  private readonly log = new Logger(SongsService.name);
  /** MusicBrainz: normalized query -> results in order (already deduped and mapped) */
  private readonly searches = new TtlCache<MappedRecording[]>(24 * HOUR, 1_000);
  /** recording id -> mapped recording; lets /resolve skip a second MusicBrainz call */
  private readonly recordings = new TtlCache<MappedRecording>(24 * HOUR, 5_000);
  /** Apple Music: normalized query -> songs and albums in Apple's order */
  private readonly appleSearches = new TtlCache<AppleSearch>(6 * HOUR, 1_000);
  /** Apple song id -> mapped song, from searches and tracklists; lets /resolve skip a lookup */
  private readonly appleSongs = new TtlCache<MappedAppleSong>(24 * HOUR, 10_000);
  private readonly appleAlbums = new TtlCache<AlbumResponse>(24 * HOUR, 500);
  /** genre id ("all" for everything) -> chart; Apple updates charts through the day */
  private readonly appleCharts = new TtlCache<AppleSearch>(HOUR, 100);
  /** "apple:<id>" or "isrc:<isrc>" -> Apple's preview clip url (null: Apple has none) */
  private readonly previews = new TtlCache<string | null>(24 * HOUR, 10_000);
  /** requests already waiting on a catalog, so identical ones share one call */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mb: MusicBrainzClient,
    private readonly apple: AppleMusicClient,
    private readonly spotify: SpotifyEmbedClient = new SpotifyEmbedClient(),
  ) {}

  async search(raw: string | undefined): Promise<SearchResponse> {
    const key = normalizeQuery(raw ?? '');
    if (key.replace(/ /g, '').length < MIN_QUERY_LENGTH) return { results: [], albums: [], usedFallback: false };

    if (this.apple.enabled) {
      try {
        const found =
          this.appleSearches.get(key) ?? (await this.shared(`apple:${key}`, () => this.fetchAppleSearch(key)));
        return {
          results: await this.withSongIds(found.songs.map(m => m.result)),
          albums: found.albums.map(a => ({ ...a })),
          usedFallback: false,
        };
      } catch (err) {
        if (!(err instanceof AppleMusicUnavailableError)) throw err;
        this.log.warn(`Apple Music search "${key}" failed, trying MusicBrainz: ${err.message}`);
      }
    }

    let mapped: MappedRecording[];
    try {
      mapped = this.searches.get(key) ?? (await this.shared(`mb:${key}`, () => this.fetchSearch(key)));
    } catch (err) {
      if (!(err instanceof MusicBrainzUnavailableError)) throw err;
      this.log.warn(`Search "${key}" fell back to the local database: ${err.message}`);
      return { results: await this.searchLocal(key), albums: [], usedFallback: true };
    }
    return { results: await this.withSongIds(mapped.map(m => m.result)), albums: [], usedFallback: false };
  }

  /** An album and its tracklist. Apple Music only: the other catalogs' albums can't be opened. */
  async album(source: unknown, externalId: unknown): Promise<AlbumResponse> {
    if (source !== 'apple') throw new BadRequestException('Only Apple Music albums can be opened.');
    if (typeof externalId !== 'string' || !APPLE_ID.test(externalId)) {
      throw new BadRequestException('The album id must be an Apple Music album id (digits).');
    }
    const found =
      this.appleAlbums.get(externalId) ??
      (await this.shared(`album:${externalId}`, () => this.fetchAppleAlbum(externalId)));
    return { album: { ...found.album }, tracks: await this.withSongIds(found.tracks) };
  }

  /** The most-played songs and albums on Apple Music right now, overall or for one genre. */
  async charts(genre: unknown): Promise<ChartsResponse> {
    if (genre !== undefined && genre !== '' && (typeof genre !== 'string' || !GENRE_ID.test(genre))) {
      throw new BadRequestException('genre must be an Apple Music genre id (digits)');
    }
    if (!this.apple.enabled) {
      throw new ServiceUnavailableException('Charts need Apple Music, which isn’t set up on this server.');
    }
    const key = typeof genre === 'string' && genre ? genre : 'all';
    let found: AppleSearch;
    try {
      found = this.appleCharts.get(key) ?? (await this.shared(`charts:${key}`, () => this.fetchAppleCharts(key)));
    } catch (err) {
      if (err instanceof AppleMusicUnavailableError || err instanceof AppleMusicNotFoundError) {
        this.log.warn(`Apple Music chart "${key}" failed: ${err.message}`);
        throw new ServiceUnavailableException('Charts are unavailable right now. Try again in a moment.');
      }
      throw err;
    }
    return {
      songs: await this.withSongIds(found.songs.map(m => m.result)),
      albums: found.albums.map(a => ({ ...a })),
    };
  }

  /**
   * The songs in an Apple Music or Spotify playlist link, as catalog songs the
   * app can queue for ranking. Nothing is saved: the app resolves each song
   * when the user ranks it, like any search result.
   *
   * Apple Music playlists are read through the Apple Music API, so every song
   * comes with its catalog id. Spotify playlists are read from Spotify's public
   * embed page (titles and artists only), then each song is found by searching
   * Apple Music; songs without a confident match are returned as `unmatched`.
   */
  async importPlaylist(url: unknown): Promise<PlaylistImportResponse> {
    const link = parsePlaylistLink(url);
    if (!link) {
      throw new BadRequestException('Paste a playlist link from Apple Music or Spotify.');
    }
    if (!this.apple.enabled) {
      throw new ServiceUnavailableException('Importing playlists needs Apple Music, which isn’t set up on this server.');
    }

    if (link.provider === 'apple') {
      let found;
      try {
        found = await this.apple.playlist(link.id, link.storefront);
      } catch (err) {
        throw this.appleError(err, 'That playlist isn’t on Apple Music. Make sure it’s shared publicly.');
      }
      const tracks = dedupeAppleSongs(found.songs).map(m => {
        this.appleSongs.set(m.result.externalId, m);
        return m.result;
      });
      return {
        name: found.name,
        provider: 'apple',
        tracks: await this.withSongIds(tracks),
        unmatched: [],
        truncated: found.truncated,
      };
    }

    let spotifyId: string;
    if (link.provider === 'spotify-short') {
      let resolved: string | null;
      try {
        resolved = await this.spotify.resolveShortLink(link.url);
      } catch (err) {
        if (err instanceof SpotifyPlaylistNotFoundError) {
          throw new NotFoundException('That Spotify link doesn’t exist anymore. Copy it again from Spotify.');
        }
        if (err instanceof SpotifyEmbedUnavailableError) {
          throw new ServiceUnavailableException('Spotify can’t be reached right now. Try again, or use an Apple Music link.');
        }
        throw err;
      }
      if (!resolved) {
        throw new BadRequestException('That Spotify link isn’t a playlist. Share a playlist, not a song or album.');
      }
      spotifyId = resolved;
    } else {
      spotifyId = link.id;
    }

    let parsed;
    try {
      parsed = await this.spotify.playlist(spotifyId);
    } catch (err) {
      if (err instanceof SpotifyPlaylistNotFoundError) {
        throw new NotFoundException('That Spotify playlist is private or doesn’t exist. Make it public and try again.');
      }
      if (err instanceof SpotifyEmbedUnavailableError) {
        this.log.warn(`Spotify playlist ${spotifyId} couldn't be read: ${err.message}`);
        throw new ServiceUnavailableException('Spotify playlists can’t be read right now. Try an Apple Music link.');
      }
      throw err;
    }
    const entries = parsed.entries.slice(0, SPOTIFY_IMPORT_LIMIT);
    const matches = await mapLimit(entries, MATCH_CONCURRENCY, async entry => {
      try {
        return pickMatch(entry, (await this.search(searchTextFor(entry))).results);
      } catch {
        return null;
      }
    });
    const seen = new Set<string>();
    const tracks: SearchResult[] = [];
    const unmatched: PlaylistEntry[] = [];
    matches.forEach((match, i) => {
      if (!match) unmatched.push(entries[i]);
      else if (!seen.has(`${match.source}:${match.externalId}`)) {
        seen.add(`${match.source}:${match.externalId}`);
        tracks.push(match);
      }
    });
    return {
      name: parsed.name ?? 'Spotify playlist',
      provider: 'spotify',
      tracks,
      unmatched,
      truncated: parsed.entries.length > SPOTIFY_IMPORT_LIMIT,
    };
  }

  /**
   * Apple Music's 30-second preview clip for a song. Apple songs are looked up
   * by id; songs from other catalogs (MusicBrainz, Spotify imports) by ISRC.
   * Only the clip's URL passes through AUX: the app streams the audio straight
   * from Apple and nothing is downloaded or stored.
   */
  async preview(source: unknown, externalId: unknown, isrc: unknown): Promise<PreviewResponse> {
    const appleId = source === 'apple' && typeof externalId === 'string' && APPLE_ID.test(externalId) ? externalId : null;
    const code = typeof isrc === 'string' && ISRC.test(isrc.toUpperCase()) ? isrc.toUpperCase() : null;
    if (!appleId && !code) {
      throw new BadRequestException('Send source=apple with an Apple Music song id, or an isrc.');
    }
    if (!this.apple.enabled) return { url: null };

    const key = appleId ? `apple:${appleId}` : `isrc:${code}`;
    const cached = this.previews.get(key);
    if (cached !== undefined) return { url: cached };
    const known = appleId ? this.appleSongs.get(appleId) : undefined;
    if (known) {
      this.previews.set(key, known.previewUrl);
      return { url: known.previewUrl };
    }

    try {
      const url = await this.shared(`preview:${key}`, async () => {
        const found = appleId
          ? previewUrl(await this.apple.song(appleId))
          : (await this.apple.songsByIsrc(code!)).map(previewUrl).find(u => u) ?? null;
        this.previews.set(key, found);
        return found;
      });
      return { url };
    } catch (err) {
      if (err instanceof AppleMusicNotFoundError) {
        this.previews.set(key, null);
        return { url: null };
      }
      if (err instanceof AppleMusicUnavailableError) {
        throw new ServiceUnavailableException('Previews are unavailable right now. Try again in a moment.');
      }
      throw err;
    }
  }

  /** Creates (or finds) the canonical AUX song for a catalog song. */
  async resolve(source: unknown, externalId: unknown): Promise<{ id: string }> {
    if (source === 'apple') return this.resolveApple(externalId);
    if (source === 'spotify') {
      throw new NotImplementedException('Spotify songs are not supported yet.');
    }
    if (source !== 'musicbrainz') {
      throw new BadRequestException('source must be "apple", "musicbrainz" or "spotify"');
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

    // Already in AUX from Apple Music (same recording, same ISRC): use that song.
    const twin = await this.findByIsrc(result.isrc);
    if (twin) return { id: twin.id };

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

  private async resolveApple(externalId: unknown): Promise<{ id: string }> {
    if (typeof externalId !== 'string' || !APPLE_ID.test(externalId)) {
      throw new BadRequestException('externalId must be an Apple Music song id (digits)');
    }
    const existing = await this.findAppleSong(externalId);
    if (existing) return existing;

    const mapped = this.appleSongs.get(externalId) ?? (await this.lookupAppleSong(externalId));
    const { result } = mapped;
    const twin = await this.findByIsrc(result.isrc);
    // Apple lists the same recording under another id (the single vs. the album): one song in AUX.
    if (twin?.source === 'apple') return { id: twin.id };

    const data = {
      source: 'apple' as const,
      externalId,
      title: result.title,
      artist: result.artist,
      albumId: await this.saveAppleAlbum(mapped),
      releaseYear: result.releaseYear,
      durationMs: result.durationMs,
      isrc: result.isrc,
      genre: result.genre,
      artworkUrl: result.artworkUrl,
      externalUrl: result.externalUrl,
    };
    try {
      if (twin) {
        // Saved earlier from MusicBrainz. Switch it to Apple Music's details but keep
        // its id, so everyone's rankings of it stay on one song.
        return await this.prisma.song.update({ where: { id: twin.id }, data, select: { id: true } });
      }
      // upsert: two users acting on the same new song at once both get one row.
      return await this.prisma.song.upsert({
        where: { source_externalId: { source: 'apple', externalId } },
        create: data,
        update: {},
        select: { id: true },
      });
    } catch (err) {
      // Saved by someone else in the same moment: use their row.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const saved = await this.findAppleSong(externalId);
        if (saved) return saved;
      }
      throw err;
    }
  }

  private findAppleSong(externalId: string) {
    return this.prisma.song.findUnique({
      where: { source_externalId: { source: 'apple', externalId } },
      select: { id: true },
    });
  }

  /** The AUX song for a recording (an ISRC identifies one recording), preferring Apple Music's copy. */
  private async findByIsrc(isrc: string | null): Promise<{ id: string; source: string } | null> {
    if (!isrc) return null;
    const songs = await this.prisma.song.findMany({
      where: { isrc },
      select: { id: true, source: true },
      orderBy: { createdAt: 'asc' },
    });
    return songs.find(s => s.source === 'apple') ?? songs[0] ?? null;
  }

  private async saveAppleAlbum({ result, album }: MappedAppleSong): Promise<string | null> {
    if (!album) return null;
    const row = await this.prisma.album.upsert({
      where: { source_externalId: { source: 'apple', externalId: album.externalId } },
      create: {
        source: 'apple',
        externalId: album.externalId,
        title: album.title,
        artist: result.artist,
        releaseYear: album.releaseYear,
        genre: result.genre,
        artworkUrl: album.artworkUrl,
        externalUrl: album.externalUrl,
      },
      update: {},
      select: { id: true },
    });
    return row.id;
  }

  /** Runs `start` unless the same request is already in flight, in which case it shares that one. */
  private shared<T>(key: string, start: () => Promise<T>): Promise<T> {
    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
    const request = start().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }

  private async fetchSearch(key: string): Promise<MappedRecording[]> {
    const mapped = dedupeRecordings(await this.mb.searchRecordings(key), MAX_RESULTS, key);
    for (const m of mapped) this.recordings.set(m.result.externalId, m);
    this.searches.set(key, mapped);
    return mapped;
  }

  private async fetchAppleSearch(key: string): Promise<AppleSearch> {
    const { songs, albums } = await this.apple.search(key);
    const found = {
      songs: dedupeAppleSongs(songs),
      albums: albums.map(mapAppleAlbum).filter((a): a is AlbumResult => a !== null),
    };
    for (const m of found.songs) this.appleSongs.set(m.result.externalId, m);
    this.appleSearches.set(key, found);
    return found;
  }

  private async fetchAppleCharts(key: string): Promise<AppleSearch> {
    const { songs, albums } = await this.apple.charts(key === 'all' ? undefined : key);
    const found = {
      songs: dedupeAppleSongs(songs),
      albums: albums.map(mapAppleAlbum).filter((a): a is AlbumResult => a !== null),
    };
    // Chart songs get ranked straight from Home, so /resolve shouldn't need another lookup.
    for (const m of found.songs) this.appleSongs.set(m.result.externalId, m);
    this.appleCharts.set(key, found);
    return found;
  }

  private async fetchAppleAlbum(id: string): Promise<AlbumResponse> {
    if (!this.apple.enabled) throw new ServiceUnavailableException('Apple Music isn’t set up on this server.');
    let raw;
    try {
      raw = await this.apple.album(id);
    } catch (err) {
      throw this.appleError(err, 'That album isn’t on Apple Music.');
    }
    const album = mapAppleAlbum(raw);
    if (!album) throw new NotFoundException('That album isn’t on Apple Music.');
    // Tracklists can include music videos; AUX ranks songs.
    const tracks = (raw.relationships?.tracks?.data ?? []).flatMap(track => {
      const mapped = track.type === 'songs' ? mapAppleSong(track as AmSong) : null;
      if (!mapped) return [];
      this.appleSongs.set(mapped.result.externalId, mapped);
      return [mapped.result];
    });
    const found = { album, tracks };
    this.appleAlbums.set(id, found);
    return found;
  }

  private async lookupAppleSong(id: string): Promise<MappedAppleSong> {
    if (!this.apple.enabled) throw new ServiceUnavailableException('Apple Music isn’t set up on this server.');
    let mapped: MappedAppleSong | null;
    try {
      mapped = mapAppleSong(await this.apple.song(id));
    } catch (err) {
      throw this.appleError(err, 'That song isn’t on Apple Music.');
    }
    if (!mapped) throw new NotFoundException('That song isn’t on Apple Music.');
    this.appleSongs.set(id, mapped);
    return mapped;
  }

  private appleError(err: unknown, notFound: string): unknown {
    if (err instanceof AppleMusicNotFoundError) return new NotFoundException(notFound);
    if (err instanceof AppleMusicUnavailableError) {
      return new ServiceUnavailableException('Apple Music is busy. Try again in a moment.');
    }
    return err;
  }

  /** Copies of the results (so cached objects never change) with AUX song ids attached. */
  private async withSongIds(results: SearchResult[]): Promise<SearchResult[]> {
    const copies = results.map(r => ({ ...r }));
    await this.attachSongIds(copies);
    return copies;
  }

  /**
   * Marks results that already exist as AUX songs so the app can link them,
   * including the same recording saved from another catalog (matched by ISRC).
   */
  private async attachSongIds(results: SearchResult[]): Promise<void> {
    if (!results.length) return;
    const sources = [...new Set(results.map(r => r.source))];
    const isrcs = results.flatMap(r => (r.isrc ? [r.isrc] : []));
    try {
      const songs = await this.prisma.song.findMany({
        where: {
          OR: [
            ...sources.map(source => ({
              source,
              externalId: { in: results.filter(r => r.source === source).map(r => r.externalId) },
            })),
            ...(isrcs.length ? [{ isrc: { in: isrcs } }] : []),
          ],
        },
        select: { id: true, source: true, externalId: true, isrc: true },
      });
      const exact = new Map(songs.map(s => [`${s.source}:${s.externalId}`, s.id]));
      const byIsrc = new Map(songs.flatMap(s => (s.isrc ? [[s.isrc, s.id] as const] : [])));
      for (const r of results) {
        r.songId = exact.get(`${r.source}:${r.externalId}`) ?? (r.isrc ? byIsrc.get(r.isrc) : undefined) ?? null;
      }
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
        genre: s.genre ?? null,
        artworkUrl: s.artworkUrl,
        externalUrl: s.externalUrl,
        songId: s.id,
      }));
    } catch (err) {
      this.log.error(`Local search failed too: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Search is unavailable right now. Try again in a moment.');
    }
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

/** Runs `fn` over `items` with at most `limit` running at once; results keep input order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
