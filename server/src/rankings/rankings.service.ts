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
