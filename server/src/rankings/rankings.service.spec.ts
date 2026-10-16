import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { chartScore, RankingsService } from './rankings.service.js';
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

describe('RankingsService.community', () => {
  function communitySetup(
    groups: { songId: string; avg: number; count: number }[],
    songs: { id: string; title: string }[],
    auxAverage: number | null = 6.5,
  ) {
    const prisma = {
      ranking: {
        aggregate: vi.fn().mockResolvedValue({ _avg: { score: auxAverage } }),
        groupBy: vi.fn().mockResolvedValue(
          groups.map((g) => ({
            songId: g.songId,
            _avg: { score: g.avg },
            _count: { songId: g.count },
          })),
        ),
      },
      song: {
        findMany: vi.fn().mockResolvedValue(
          songs.map((s) => ({ ...s, album: { title: 'Blonde' } })),
        ),
      },
    };
    return {
      service: new RankingsService(prisma as unknown as PrismaService),
      prisma,
    };
  }

  it('weights each average by how many people ranked it', () => {
    // AUX average 6.5, three listeners' worth of pull toward it.
    expect(chartScore(10, 1, 6.5)).toBeCloseTo(7.375);
    expect(chartScore(9.5, 4, 6.5)).toBeCloseTo(8.214, 3);
    expect(chartScore(9, 20, 6.5)).toBeCloseTo(8.674, 3);
  });

  it('puts a song many people love above one person’s 10.00', async () => {
    const { service } = communitySetup(
      [
        { songId: SONG(1), avg: 10, count: 1 },
        { songId: SONG(2), avg: 9, count: 20 },
        { songId: SONG(3), avg: 9.5, count: 4 },
      ],
      // The database returns songs in any order; the chart order must win.
      [
        { id: SONG(1), title: 'Ivy' },
        { id: SONG(2), title: 'Nights' },
        { id: SONG(3), title: 'Nikes' },
      ],
    );
    const { entries } = await service.community();
    expect(
      entries.map((e) => [e.song.title, e.averageScore, e.listeners, e.chartScore]),
    ).toEqual([
      ['Nights', 9, 20, 8.67],
      ['Nikes', 9.5, 4, 8.21],
      ['Ivy', 10, 1, 7.38],
    ]);
    expect(entries[0].song.album).toBe('Blonde');
  });

  it('breaks ties in favor of the song more people ranked', async () => {
    // Every song averages the AUX average, so all three chart scores are equal.
    const { service } = communitySetup(
      [
        { songId: SONG(1), avg: 8.5, count: 3 },
        { songId: SONG(2), avg: 8.5, count: 3 },
        { songId: SONG(3), avg: 8.5, count: 9 },
      ],
      [
        { id: SONG(1), title: 'Ivy' },
        { id: SONG(2), title: 'Nights' },
        { id: SONG(3), title: 'Nikes' },
      ],
      8.5,
    );
    const { entries } = await service.community();
    expect(entries[0].song.title).toBe('Nikes');
  });

  it('is empty before anyone has ranked anything', async () => {
    const { service } = communitySetup([], [], null);
    await expect(service.community()).resolves.toEqual({ entries: [] });
  });

  it('filters to one genre family but keeps the AUX-wide baseline', async () => {
    const { service, prisma } = communitySetup([], []);
    await service.community({ genre: 'hip-hop', limit: '100' });
    const args = prisma.ranking.groupBy.mock.calls[0][0];
    expect(args.where.song.OR).toContainEqual({
      genre: { equals: 'Hip-Hop/Rap', mode: 'insensitive' },
    });
    expect(prisma.ranking.aggregate.mock.calls[0][0].where).toBeUndefined();
  });

  it('returns 50 songs by default, up to 100 when asked, and treats "all" as no filter', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      songId: SONG(i + 1),
      avg: 5 + (i % 50) / 10,
      count: 1 + (i % 7),
    }));
    const songs = many.map((g) => ({ id: g.songId, title: g.songId }));
    const { service, prisma } = communitySetup(many, songs);
    expect((await service.community({ genre: 'all' })).entries).toHaveLength(50);
    expect(prisma.ranking.groupBy.mock.calls[0][0].where).toBeUndefined();
    expect((await service.community({ limit: '100' })).entries).toHaveLength(100);
  });

  it('rejects unknown genres and out-of-range limits', async () => {
    const { service } = communitySetup([], []);
    await expect(service.community({ genre: 'polka' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.community({ limit: '500' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.community({ limit: 'ten' })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('RankingsService.songStats', () => {
  function statsSetup() {
    const prisma = {
      ranking: {
        groupBy: vi.fn().mockResolvedValue([
          { songId: SONG(1), _avg: { score: 7.456 }, _count: { songId: 4 } },
        ]),
      },
    };
    return {
      service: new RankingsService(prisma as unknown as PrismaService),
      prisma,
    };
  }

  it('returns each ranked song’s average and listener count, skipping duplicates', async () => {
    const { service, prisma } = statsSetup();
    await expect(
      service.songStats(`${SONG(1)},${SONG(2)},${SONG(1)}`),
    ).resolves.toEqual({
      stats: [{ songId: SONG(1), listeners: 4, averageScore: 7.46 }],
    });
    expect(prisma.ranking.groupBy.mock.calls[0][0].where).toEqual({
      songId: { in: [SONG(1), SONG(2)] },
    });
  });

  it('answers an empty request without a query, and rejects bad ids', async () => {
    const { service, prisma } = statsSetup();
    await expect(service.songStats(undefined)).resolves.toEqual({ stats: [] });
    expect(prisma.ranking.groupBy).not.toHaveBeenCalled();
    await expect(service.songStats('not-a-uuid')).rejects.toThrow(
      BadRequestException,
    );
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
