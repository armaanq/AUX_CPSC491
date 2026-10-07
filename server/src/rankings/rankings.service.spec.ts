import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RankingsService } from './rankings.service.js';
import type { Placement } from './scoring.js';

const USER = '11111111-1111-4111-8111-111111111111';
const SONG = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function setup(existing: Placement[] = []) {
  const rows = new Map(existing.map((p) => [p.songId, { ...p }]));
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    song: {
      findUnique: vi.fn(({ where }) =>
        Promise.resolve(where.id === SONG(404) ? null : { id: where.id }),
      ),
    },
    ranking: {
      findMany: vi.fn(({ select }) =>
        Promise.resolve(
          [...rows.values()].map((r) =>
            select.song
              ? {
                  ...r,
                  createdAt: new Date(0),
                  song: { id: r.songId, album: null },
                }
              : r,
          ),
        ),
      ),
      create: vi.fn(({ data }) => {
        rows.set(data.songId, data);
        return Promise.resolve(data);
      }),
      update: vi.fn(({ where, data }) => {
        const key = where.userId_songId.songId;
        rows.set(key, { ...rows.get(key)!, ...data });
        return Promise.resolve(rows.get(key));
      }),
      deleteMany: vi.fn(({ where }) => {
        for (const id of where.songId.in) rows.delete(id);
        return Promise.resolve({ count: where.songId.in.length });
      }),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return {
    service: new RankingsService(prisma as unknown as PrismaService),
    tx,
    prisma,
  };
}

describe('RankingsService.place', () => {
  it('ranks a new song inside a transaction that locks the user first', async () => {
    const { service, tx, prisma } = setup();
    const { rankings } = await service.place(USER, SONG(1), {
      sentiment: 'LOVED',
      position: 0,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.ranking.create).toHaveBeenCalledWith({
      data: {
        userId: USER,
        songId: SONG(1),
        sentiment: 'LOVED',
        position: 0,
        score: 10,
      },
    });
    expect(rankings.map((r) => [r.song.id, r.score])).toEqual([[SONG(1), 10]]);
  });

  it('only rewrites rows whose position or score changed', async () => {
    const { service, tx } = setup([
      { songId: SONG(1), sentiment: 'LOVED', position: 0, score: 10 },
      { songId: SONG(2), sentiment: 'FINE', position: 0, score: 6.66 },
    ]);
    await service.place(USER, SONG(3), { sentiment: 'LOVED', position: 1 });
    expect(tx.ranking.create).toHaveBeenCalledTimes(1);
    // A 2-song band scores 10 and 8.34, so SONG(1) keeps position 0 and 10.
    expect(tx.ranking.update).not.toHaveBeenCalled();
  });

  it('updates the songs it pushes down', async () => {
    const { service, tx } = setup([
      { songId: SONG(1), sentiment: 'LOVED', position: 0, score: 10 },
    ]);
    const { rankings } = await service.place(USER, SONG(2), {
      sentiment: 'LOVED',
      position: 0,
    });
    expect(tx.ranking.update).toHaveBeenCalledWith({
      where: { userId_songId: { userId: USER, songId: SONG(1) } },
      data: { sentiment: 'LOVED', position: 1, score: 8.34 },
    });
    expect(rankings.map((r) => r.song.id)).toEqual([SONG(2), SONG(1)]);
  });

  it.each([
    [
      'a song id that is not a UUID',
      'not-a-uuid',
      { sentiment: 'LOVED', position: 0 },
    ],
    ['an unknown sentiment', SONG(1), { sentiment: 'AMAZING', position: 0 }],
    ['a missing sentiment', SONG(1), { position: 0 }],
    ['a negative position', SONG(1), { sentiment: 'LOVED', position: -1 }],
    ['a fractional position', SONG(1), { sentiment: 'LOVED', position: 1.5 }],
    ['a position sent as text', SONG(1), { sentiment: 'LOVED', position: '0' }],
  ])('rejects %s without touching the database', async (_, songId, body) => {
    const { service, prisma } = setup();
    await expect(service.place(USER, songId, body)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a song that is not in AUX yet', async () => {
    const { service, tx } = setup();
    await expect(
      service.place(USER, SONG(404), { sentiment: 'LOVED', position: 0 }),
    ).rejects.toThrow(NotFoundException);
    expect(tx.ranking.create).not.toHaveBeenCalled();
  });
});

describe('RankingsService.remove', () => {
  it('deletes the song and re-spreads its band', async () => {
    const { service, tx } = setup([
      { songId: SONG(1), sentiment: 'LOVED', position: 0, score: 10 },
      { songId: SONG(2), sentiment: 'LOVED', position: 1, score: 8.34 },
    ]);
    const { rankings } = await service.remove(USER, SONG(1));
    expect(tx.ranking.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER, songId: { in: [SONG(1)] } },
    });
    expect(rankings.map((r) => [r.song.id, r.position, r.score])).toEqual([
      [SONG(2), 0, 10],
    ]);
  });

  it('is a no-op for a song that is not ranked, so retries are safe', async () => {
    const { service, tx } = setup([
      { songId: SONG(1), sentiment: 'LOVED', position: 0, score: 10 },
    ]);
    await service.remove(USER, SONG(9));
    expect(tx.ranking.deleteMany).not.toHaveBeenCalled();
    expect(tx.ranking.update).not.toHaveBeenCalled();
  });
});
