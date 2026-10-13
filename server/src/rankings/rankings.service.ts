import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, Sentiment } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  bestFirst,
  place,
  remove,
  SENTIMENT_ORDER,
  type Placement,
} from './scoring.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the app needs to show a ranked song without another lookup. */
const songSelect = {
  id: true,
  source: true,
  externalId: true,
  title: true,
  artist: true,
  releaseYear: true,
  durationMs: true,
  isrc: true,
  genre: true,
  artworkUrl: true,
  externalUrl: true,
  album: { select: { title: true } },
} as const satisfies Prisma.SongSelect;

type SongRow = Prisma.SongGetPayload<{ select: typeof songSelect }>;

export interface RankedSong {
  sentiment: Sentiment;
  position: number;
  score: number;
  rankedAt: Date;
  song: Omit<SongRow, 'album'> & { album: string | null };
}

export interface RankingsResponse {
  /** Best first: all LOVED songs, then FINE, then DISLIKED. */
  rankings: RankedSong[];
}

export interface CommunityEntry {
  song: RankedSong['song'];
  /** How many AUX users have ranked it. */
  listeners: number;
  /** Their scores averaged, 0-10. */
  averageScore: number;
}

export interface CommunityChartResponse {
  /** Highest average score first; ties go to the song more people ranked. */
  entries: CommunityEntry[];
}

const COMMUNITY_CHART_SIZE = 50;
/** The Hot 100 is the longest chart the app asks for. */
const COMMUNITY_CHART_MAX = 100;
/** The most songs one stats request can ask about (a page of search results). */
const STATS_MAX_IDS = 60;

/**
 * Genre filters for the AUX chart. Song.genre holds the catalog's own genre
 * name (Apple Music's main genre, e.g. "Hip-Hop/Rap"), so each filter lists
 * the names that belong to it. Keys mirror mobile/src/api/charts.ts.
 */
export const COMMUNITY_GENRES: Record<string, readonly string[]> = {
  pop: ['Pop', 'Pop/Rock', 'Pop in Spanish'],
  'hip-hop': ['Hip-Hop/Rap', 'Hip-Hop', 'Rap', 'Hardcore Rap', 'West Coast Rap', 'Underground Rap'],
  rnb: ['R&B/Soul', 'R&B', 'Soul', 'Contemporary R&B', 'Neo-Soul'],
  alternative: ['Alternative', 'Indie Rock', 'Indie Pop', 'Alternative Rap'],
  rock: ['Rock', 'Hard Rock', 'Metal', 'Punk'],
  country: ['Country', 'Contemporary Country'],
  latin: ['Latin', 'Urbano latino', 'Latin Urban', 'Reggaeton', 'Música Mexicana', 'Pop Latino'],
  dance: ['Dance', 'Electronic', 'House', 'Techno'],
  'k-pop': ['K-Pop'],
};

export interface CommunityQuery {
  genre?: unknown;
  limit?: unknown;
}

export interface SongStats {
  songId: string;
  listeners: number;
  averageScore: number;
}

export interface PlaceBody {
  sentiment?: unknown;
  position?: unknown;
}

type Db = Prisma.TransactionClient;

@Injectable()
export class RankingsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string): Promise<RankingsResponse> {
    return this.load(this.prisma, userId);
  }

  async place(
    userId: string,
    songId: string,
    body: PlaceBody,
  ): Promise<RankingsResponse> {
    checkSongId(songId);
    const { sentiment, position } = body;
    if (!SENTIMENT_ORDER.includes(sentiment as Sentiment)) {
      throw new BadRequestException(
        'sentiment must be "LOVED", "FINE" or "DISLIKED"',
      );
    }
    if (!Number.isInteger(position) || (position as number) < 0) {
      throw new BadRequestException(
        'position must be a whole number, 0 or more',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const song = await tx.song.findUnique({
        where: { id: songId },
        select: { id: true },
      });
      if (!song) {
        throw new NotFoundException(
          'That song isn’t in AUX yet. Search for it first.',
        );
      }
      const current = await placements(tx, userId);
      const next = place(
        current,
        songId,
        sentiment as Sentiment,
        position as number,
      );
      await apply(tx, userId, current, next);
      return this.load(tx, userId);
    });
  }

  async remove(userId: string, songId: string): Promise<RankingsResponse> {
    checkSongId(songId);
    return this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const current = await placements(tx, userId);
      // Removing a song that isn't ranked is a no-op, so retries are safe.
      await apply(tx, userId, current, remove(current, songId));
      return this.load(tx, userId);
    });
  }

  /** Every AUX user's rankings combined into one chart. No usernames, just totals. */
  async community(query: CommunityQuery = {}): Promise<CommunityChartResponse> {
    const { genre, limit } = query;
    let names: readonly string[] | undefined;
    if (genre !== undefined && genre !== '' && genre !== 'all') {
      names = typeof genre === 'string' ? COMMUNITY_GENRES[genre] : undefined;
      if (!names) {
        throw new BadRequestException(
          `genre must be one of: ${Object.keys(COMMUNITY_GENRES).join(', ')}`,
        );
      }
    }
    let take = COMMUNITY_CHART_SIZE;
    if (limit !== undefined && limit !== '') {
      take = Number(limit);
      if (!Number.isInteger(take) || take < 1 || take > COMMUNITY_CHART_MAX) {
        throw new BadRequestException(
          `limit must be a whole number from 1 to ${COMMUNITY_CHART_MAX}`,
        );
      }
    }
    const groups = await this.prisma.ranking.groupBy({
      by: ['songId'],
      where: names
        ? {
            song: {
              OR: names.map((name) => ({
                genre: { equals: name, mode: 'insensitive' as const },
              })),
            },
          }
        : undefined,
      _avg: { score: true },
      _count: { songId: true },
      orderBy: [{ _avg: { score: 'desc' } }, { _count: { songId: 'desc' } }],
      take,
    });
    const songs = await this.prisma.song.findMany({
      where: { id: { in: groups.map((g) => g.songId) } },
      select: songSelect,
    });
    const byId = new Map(songs.map((s) => [s.id, s]));
    return {
      entries: groups.flatMap((g) => {
        const row = byId.get(g.songId);
        if (!row) return [];
        const { album, ...song } = row;
        return [
          {
            song: { ...song, album: album?.title ?? null },
            listeners: g._count.songId,
            averageScore: Math.round((g._avg.score ?? 0) * 100) / 100,
          },
        ];
      }),
    };
  }

  /**
   * How AUX ranks each of these songs overall. Songs nobody has ranked are
   * left out. Used to show "you vs. everyone" next to search results.
   */
  async songStats(rawIds: unknown): Promise<{ stats: SongStats[] }> {
    const ids =
      typeof rawIds === 'string'
        ? [...new Set(rawIds.split(',').map((id) => id.trim()).filter(Boolean))]
        : [];
    if (!ids.length) return { stats: [] };
    if (ids.length > STATS_MAX_IDS) {
      throw new BadRequestException(`ask about at most ${STATS_MAX_IDS} songs at once`);
    }
    ids.forEach(checkSongId);
    const groups = await this.prisma.ranking.groupBy({
      by: ['songId'],
      where: { songId: { in: ids } },
      _avg: { score: true },
      _count: { songId: true },
    });
    return {
      stats: groups.map((g) => ({
        songId: g.songId,
        listeners: g._count.songId,
        averageScore: Math.round((g._avg.score ?? 0) * 100) / 100,
      })),
    };
  }

  private async load(db: Db, userId: string): Promise<RankingsResponse> {
    const rows = await db.ranking.findMany({
      where: { userId },
      select: {
        sentiment: true,
        position: true,
        score: true,
        createdAt: true,
        song: { select: songSelect },
      },
    });
    return {
      rankings: bestFirst(rows).map(
        ({ createdAt, song: { album, ...song }, ...r }) => ({
          ...r,
          rankedAt: createdAt,
          song: { ...song, album: album?.title ?? null },
        }),
      ),
    };
  }
}

function checkSongId(songId: string) {
  if (!UUID.test(songId)) {
    throw new BadRequestException('songId must be an AUX song id (a UUID)');
  }
}

/**
 * One ranking change at a time per user: two quick changes from the same
 * account would otherwise both renumber the same band and clash.
 */
async function lockUser(tx: Db, userId: string) {
  await tx.$queryRaw`SELECT 1 FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
}

async function placements(tx: Db, userId: string): Promise<Placement[]> {
  return tx.ranking.findMany({
    where: { userId },
    select: { songId: true, sentiment: true, position: true, score: true },
  });
}

/** Writes only what changed, so untouched rows keep their timestamps. */
export async function apply(
  tx: Db,
  userId: string,
  before: Placement[],
  after: Placement[],
) {
  const previous = new Map(before.map((p) => [p.songId, p]));
  const kept = new Set(after.map((p) => p.songId));
  const removed = before
    .filter((p) => !kept.has(p.songId))
    .map((p) => p.songId);
  if (removed.length) {
    await tx.ranking.deleteMany({ where: { userId, songId: { in: removed } } });
  }
  for (const p of after) {
    const old = previous.get(p.songId);
    const data = {
      sentiment: p.sentiment,
      position: p.position,
      score: p.score,
    };
    if (!old) {
      await tx.ranking.create({ data: { userId, songId: p.songId, ...data } });
    } else if (
      old.sentiment !== p.sentiment ||
      old.position !== p.position ||
      old.score !== p.score
    ) {
      await tx.ranking.update({
        where: { userId_songId: { userId, songId: p.songId } },
        data,
      });
    }
  }
}
