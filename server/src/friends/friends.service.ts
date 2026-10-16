import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, Sentiment } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  RankingsService,
  type RankedSong,
} from '../rankings/rankings.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Usernames are stored lowercase: letters, numbers, underscores and periods. */
const USERNAME_QUERY = /^[a-z0-9_.]{1,20}$/;
const SEARCH_LIMIT = 20;
/** A taste match needs this many songs both people ranked before it means anything. */
export const TASTE_MIN_SHARED = 3;

/** How you're connected to another user, from your side. */
export type FriendStatus = 'self' | 'friends' | 'incoming' | 'outgoing' | 'none';

export interface TasteMatch {
  /** 0-100: how closely your scores agree on the songs you both ranked. Null until TASTE_MIN_SHARED. */
  score: number | null;
  /** Songs you've both ranked. */
  shared: number;
}

/** Another listener as anyone on AUX can see them. Never includes email. */
export interface PublicUser {
  id: string;
  username: string;
  bio: string;
  avatarUrl: string | null;
  createdAt: Date;
  rankedCount: number;
  status: FriendStatus;
  taste: TasteMatch;
}

export interface FriendsResponse {
  friends: PublicUser[];
  /** Requests waiting for you to accept. */
  incoming: PublicUser[];
  /** Requests you sent that haven't been accepted. */
  outgoing: PublicUser[];
}

export interface ProfileResponse {
  user: PublicUser;
  /** Best first, like your own. Profiles are public to everyone on AUX. */
  rankings: RankedSong[];
}

export interface FriendScore {
  user: { id: string; username: string };
  sentiment: Sentiment;
  score: number;
}

const publicSelect = {
  id: true,
  username: true,
  bio: true,
  avatarUrl: true,
  createdAt: true,
  _count: { select: { rankings: true } },
} as const satisfies Prisma.UserSelect;

type PublicRow = Prisma.UserGetPayload<{ select: typeof publicSelect }>;

type Db = Prisma.TransactionClient;

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rankings: RankingsService,
  ) {}

  /** Your friends and pending requests, both ways. */
  async list(me: string): Promise<FriendsResponse> {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ requesterId: me }, { addresseeId: me }] },
      select: {
        requesterId: true,
        status: true,
        requester: { select: publicSelect },
        addressee: { select: publicSelect },
      },
      orderBy: { createdAt: 'desc' },
    });
    const sorted = { friends: [], incoming: [], outgoing: [] } as Record<
      keyof FriendsResponse,
      PublicRow[]
    >;
    for (const row of rows) {
      const sent = row.requesterId === me;
      const other = sent ? row.addressee : row.requester;
      if (row.status === 'ACCEPTED') sorted.friends.push(other);
      else (sent ? sorted.outgoing : sorted.incoming).push(other);
    }
    const all = [...sorted.friends, ...sorted.incoming, ...sorted.outgoing];
    const tastes = await this.tastes(me, all.map((u) => u.id));
    const publicOf = (status: FriendStatus) => (u: PublicRow) =>
      toPublic(u, status, tastes);
    return {
      friends: sorted.friends
        .sort((a, b) => a.username.localeCompare(b.username))
        .map(publicOf('friends')),
      incoming: sorted.incoming.map(publicOf('incoming')),
      outgoing: sorted.outgoing.map(publicOf('outgoing')),
    };
  }

  /**
   * People to add: usernames containing `query` (closest matches first), or
   * the newest listeners when there's no query. Never includes you.
   */
  async search(me: string, raw: unknown): Promise<{ users: PublicUser[] }> {
    const query =
      typeof raw === 'string' ? raw.trim().replace(/^@/, '').toLowerCase() : '';
    if (query && !USERNAME_QUERY.test(query)) return { users: [] };
    const found = await this.prisma.user.findMany({
      where: {
        id: { not: me },
        ...(query ? { username: { contains: query } } : {}),
      },
      select: publicSelect,
      orderBy: query ? { username: 'asc' } : { createdAt: 'desc' },
      take: query ? SEARCH_LIMIT * 2 : SEARCH_LIMIT,
    });
    const closeness = (name: string) =>
      name === query ? 0 : name.startsWith(query) ? 1 : 2;
    const users = query
      ? found
          .sort((a, b) => closeness(a.username) - closeness(b.username))
          .slice(0, SEARCH_LIMIT)
      : found;
    const ids = users.map((u) => u.id);
    const [statuses, tastes] = await Promise.all([
      this.statuses(me, ids),
      this.tastes(me, ids),
    ]);
    return {
      users: users.map((u) =>
        toPublic(u, statuses.get(u.id) ?? 'none', tastes),
      ),
    };
  }

  /** Anyone's profile: who they are, how you're connected, and their rankings. */
  async profile(me: string, userId: string): Promise<ProfileResponse> {
    checkUserId(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicSelect,
    });
    if (!user) throw new NotFoundException('That listener isn’t on AUX.');
    const [statuses, tastes, { rankings }] = await Promise.all([
      this.statuses(me, [userId]),
      this.tastes(me, [userId]),
      this.rankings.list(userId),
    ]);
    const status = userId === me ? 'self' : (statuses.get(userId) ?? 'none');
    return { user: toPublic(user, status, tastes), rankings };
  }

  /**
   * Sends a friend request, or accepts theirs if they already asked you.
   * Repeating it changes nothing, so a double tap is harmless.
   */
  async request(me: string, userId: string): Promise<{ status: FriendStatus }> {
    checkUserId(userId);
    if (userId === me) {
      throw new BadRequestException('You can’t add yourself as a friend.');
    }
    return this.prisma.$transaction(async (tx) => {
      // Two people adding each other at once must end as one friendship.
      const locked = await lockPair(tx, me, userId);
      if (locked < 2) throw new NotFoundException('That listener isn’t on AUX.');
      const existing = await tx.friendship.findFirst({
        where: pairWhere(me, userId),
        select: { id: true, requesterId: true, status: true },
      });
      if (!existing) {
        await tx.friendship.create({
          data: { requesterId: me, addresseeId: userId },
        });
        return { status: 'outgoing' as const };
      }
      if (existing.status === 'ACCEPTED') return { status: 'friends' as const };
      if (existing.requesterId === me) return { status: 'outgoing' as const };
      await tx.friendship.update({
        where: { id: existing.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      return { status: 'friends' as const };
    });
  }

  /** Cancels your request, declines theirs, or unfriends. Safe to repeat. */
  async remove(me: string, userId: string): Promise<{ status: FriendStatus }> {
    checkUserId(userId);
    await this.prisma.friendship.deleteMany({ where: pairWhere(me, userId) });
    return { status: 'none' };
  }

  /** How your friends scored one song, best first. */
  async songScores(
    me: string,
    songId: string,
  ): Promise<{ scores: FriendScore[] }> {
    if (!UUID.test(songId)) {
      throw new BadRequestException('songId must be an AUX song id (a UUID)');
    }
    const friendships = await this.prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: me }, { addresseeId: me }],
      },
      select: { requesterId: true, addresseeId: true },
    });
    const friendIds = friendships.map((f) =>
      f.requesterId === me ? f.addresseeId : f.requesterId,
    );
    if (!friendIds.length) return { scores: [] };
    const rows = await this.prisma.ranking.findMany({
      where: { songId, userId: { in: friendIds } },
      select: {
        sentiment: true,
        score: true,
        user: { select: { id: true, username: true } },
      },
      orderBy: { score: 'desc' },
    });
    return { scores: rows };
  }

  /** Your status with each of these users. Users you've no connection with are left out. */
  private async statuses(
    me: string,
    ids: string[],
  ): Promise<Map<string, FriendStatus>> {
    const others = ids.filter((id) => id !== me);
    if (!others.length) return new Map();
    const rows = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: me, addresseeId: { in: others } },
          { addresseeId: me, requesterId: { in: others } },
        ],
      },
      select: { requesterId: true, addresseeId: true, status: true },
    });
    return new Map(
      rows.map((r) => {
        const sent = r.requesterId === me;
        const status: FriendStatus =
          r.status === 'ACCEPTED' ? 'friends' : sent ? 'outgoing' : 'incoming';
        return [sent ? r.addresseeId : r.requesterId, status];
      }),
    );
  }

  /**
   * Taste match with each user, from the songs you've both ranked:
   * 100 means your scores agree exactly, and every point of average
   * difference costs 10.
   */
  private async tastes(
    me: string,
    ids: string[],
  ): Promise<Map<string, TasteMatch>> {
    const others = ids.filter((id) => id !== me);
    if (!others.length) return new Map();
    const rows = await this.prisma.$queryRaw<
      { userId: string; shared: number; gap: number }[]
    >`
      SELECT them."userId" AS "userId",
             COUNT(*)::int AS shared,
             AVG(ABS(mine.score - them.score))::float AS gap
      FROM "Ranking" mine
      JOIN "Ranking" them ON them."songId" = mine."songId"
      WHERE mine."userId" = ${me}::uuid
        AND them."userId" = ANY(${others}::uuid[])
      GROUP BY them."userId"`;
    return new Map(
      rows.map((r) => [
        r.userId,
        {
          shared: r.shared,
          score:
            r.shared >= TASTE_MIN_SHARED
              ? Math.round(100 * (1 - r.gap / 10))
              : null,
        },
      ]),
    );
  }
}

function checkUserId(userId: string) {
  if (!UUID.test(userId)) {
    throw new BadRequestException('userId must be an AUX user id (a UUID)');
  }
}

function pairWhere(a: string, b: string): Prisma.FriendshipWhereInput {
  return {
    OR: [
      { requesterId: a, addresseeId: b },
      { requesterId: b, addresseeId: a },
    ],
  };
}

/** Locks both users' rows in id order (so two requests can't deadlock). Returns how many exist. */
async function lockPair(tx: Db, a: string, b: string): Promise<number> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "User" WHERE id IN (${a}::uuid, ${b}::uuid)
    ORDER BY id FOR UPDATE`;
  return rows.length;
}

function toPublic(
  { _count, ...user }: PublicRow,
  status: FriendStatus,
  tastes: Map<string, TasteMatch>,
): PublicUser {
  return {
    ...user,
    rankedCount: _count.rankings,
    status,
    taste: tastes.get(user.id) ?? { score: null, shared: 0 },
  };
}
