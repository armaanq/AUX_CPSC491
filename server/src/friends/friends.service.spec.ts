import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RankingsService } from '../rankings/rankings.service.js';
import { FriendsService } from './friends.service.js';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ME = ID(1);
const user = (n: number, username: string, rankings = 0) => ({
  id: ID(n),
  username,
  bio: '',
  avatarUrl: null,
  createdAt: new Date(0),
  _count: { rankings },
});

function setup() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: ME }, { id: ID(2) }]),
    friendship: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    friendship: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    ranking: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const rankings = { list: vi.fn().mockResolvedValue({ rankings: [] }) };
  return {
    service: new FriendsService(
      prisma as unknown as PrismaService,
      rankings as unknown as RankingsService,
    ),
    prisma,
    tx,
    rankings,
  };
}

describe('FriendsService.list', () => {
  it('splits friendships into friends, requests to you, and requests you sent', async () => {
    const { service, prisma } = setup();
    prisma.friendship.findMany.mockResolvedValue([
      { requesterId: ME, status: 'ACCEPTED', requester: user(1, 'me'), addressee: user(3, 'zoe', 12) },
      { requesterId: ID(2), status: 'ACCEPTED', requester: user(2, 'arian', 40), addressee: user(1, 'me') },
      { requesterId: ID(4), status: 'PENDING', requester: user(4, 'shyan'), addressee: user(1, 'me') },
      { requesterId: ME, status: 'PENDING', requester: user(1, 'me'), addressee: user(5, 'maya') },
    ]);
    // Arian shares 10 songs with you; Zoe only 2, too few for a match.
    prisma.$queryRaw.mockResolvedValue([
      { userId: ID(2), shared: 10, gap: 1.5 },
      { userId: ID(3), shared: 2, gap: 0.1 },
    ]);
    const res = await service.list(ME);
    expect(res.friends.map((u) => [u.username, u.status, u.rankedCount, u.taste])).toEqual([
      ['arian', 'friends', 40, { score: 85, shared: 10 }],
      ['zoe', 'friends', 12, { score: null, shared: 2 }],
    ]);
    expect(res.incoming.map((u) => [u.username, u.status])).toEqual([['shyan', 'incoming']]);
    expect(res.outgoing.map((u) => [u.username, u.status])).toEqual([['maya', 'outgoing']]);
    expect(res.friends[0]).not.toHaveProperty('_count');
    expect(res.friends[0]).not.toHaveProperty('email');
  });
});

describe('FriendsService.search', () => {
  it('matches usernames case-insensitively, closest first, never including you', async () => {
    const { service, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([
      user(2, 'arian_g'),
      user(3, 'marian'),
      user(4, 'arian'),
    ]);
    prisma.friendship.findMany.mockResolvedValue([
      { requesterId: ID(4), addresseeId: ME, status: 'PENDING' },
    ]);
    const { users } = await service.search(ME, '  @Arian ');
    expect(users.map((u) => [u.username, u.status])).toEqual([
      ['arian', 'incoming'],
      ['arian_g', 'none'],
      ['marian', 'none'],
    ]);
    const args = prisma.user.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: { not: ME }, username: { contains: 'arian' } });
  });

  it('lists the newest listeners when there is no query', async () => {
    const { service, prisma } = setup();
    await service.search(ME, '');
    const args = prisma.user.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: { not: ME } });
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('answers a query no username could match without touching the database', async () => {
    const { service, prisma } = setup();
    await expect(service.search(ME, 'drop table;')).resolves.toEqual({ users: [] });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});

describe('FriendsService.profile', () => {
  it('returns anyone’s profile with their rankings and your status', async () => {
    const { service, prisma, rankings } = setup();
    prisma.user.findUnique.mockResolvedValue(user(2, 'arian', 1));
    prisma.friendship.findMany.mockResolvedValue([
      { requesterId: ME, addresseeId: ID(2), status: 'ACCEPTED' },
    ]);
    const ranked = [{ score: 10 }];
    rankings.list.mockResolvedValue({ rankings: ranked });
    const res = await service.profile(ME, ID(2));
    expect(res.user.status).toBe('friends');
    expect(res.rankings).toBe(ranked);
    expect(rankings.list).toHaveBeenCalledWith(ID(2));
  });

  it('marks your own profile as yours', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(user(1, 'me'));
    expect((await service.profile(ME, ME)).user.status).toBe('self');
  });

  it('404s for an unknown user and 400s for a malformed id', async () => {
    const { service } = setup();
    await expect(service.profile(ME, ID(9))).rejects.toThrow(NotFoundException);
    await expect(service.profile(ME, 'not-an-id')).rejects.toThrow(BadRequestException);
  });
});

describe('FriendsService.request', () => {
  it('sends a request inside a transaction that locks both users', async () => {
    const { service, tx } = setup();
    await expect(service.request(ME, ID(2))).resolves.toEqual({ status: 'outgoing' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.friendship.create).toHaveBeenCalledWith({
      data: { requesterId: ME, addresseeId: ID(2) },
    });
  });

  it('accepts when they already asked you', async () => {
    const { service, tx } = setup();
    tx.friendship.findFirst.mockResolvedValue({ id: 'f1', requesterId: ID(2), status: 'PENDING' });
    await expect(service.request(ME, ID(2))).resolves.toEqual({ status: 'friends' });
    expect(tx.friendship.update).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { status: 'ACCEPTED', acceptedAt: expect.any(Date) },
    });
    expect(tx.friendship.create).not.toHaveBeenCalled();
  });

  it('changes nothing when repeated', async () => {
    const { service, tx } = setup();
    tx.friendship.findFirst.mockResolvedValue({ id: 'f1', requesterId: ME, status: 'PENDING' });
    await expect(service.request(ME, ID(2))).resolves.toEqual({ status: 'outgoing' });
    tx.friendship.findFirst.mockResolvedValue({ id: 'f1', requesterId: ID(2), status: 'ACCEPTED' });
    await expect(service.request(ME, ID(2))).resolves.toEqual({ status: 'friends' });
    expect(tx.friendship.create).not.toHaveBeenCalled();
    expect(tx.friendship.update).not.toHaveBeenCalled();
  });

  it('refuses yourself and people who aren’t on AUX', async () => {
    const { service, tx, prisma } = setup();
    await expect(service.request(ME, ME)).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    tx.$queryRaw.mockResolvedValue([{ id: ME }]);
    await expect(service.request(ME, ID(9))).rejects.toThrow(NotFoundException);
    expect(tx.friendship.create).not.toHaveBeenCalled();
  });
});

describe('FriendsService.remove', () => {
  it('deletes the friendship whichever of you sent it', async () => {
    const { service, prisma } = setup();
    await expect(service.remove(ME, ID(2))).resolves.toEqual({ status: 'none' });
    expect(prisma.friendship.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { requesterId: ME, addresseeId: ID(2) },
          { requesterId: ID(2), addresseeId: ME },
        ],
      },
    });
  });
});

describe('FriendsService.songScores', () => {
  it('returns only accepted friends’ scores for the song', async () => {
    const { service, prisma } = setup();
    prisma.friendship.findMany.mockResolvedValue([
      { requesterId: ME, addresseeId: ID(2) },
      { requesterId: ID(3), addresseeId: ME },
    ]);
    const rows = [{ sentiment: 'LOVED', score: 9.5, user: { id: ID(2), username: 'arian' } }];
    prisma.ranking.findMany.mockResolvedValue(rows);
    await expect(service.songScores(ME, ID(7))).resolves.toEqual({ scores: rows });
    expect(prisma.friendship.findMany.mock.calls[0][0].where.status).toBe('ACCEPTED');
    expect(prisma.ranking.findMany.mock.calls[0][0].where).toEqual({
      songId: ID(7),
      userId: { in: [ID(2), ID(3)] },
    });
  });

  it('skips the rankings query when you have no friends yet', async () => {
    const { service, prisma } = setup();
    await expect(service.songScores(ME, ID(7))).resolves.toEqual({ scores: [] });
    expect(prisma.ranking.findMany).not.toHaveBeenCalled();
  });
});
