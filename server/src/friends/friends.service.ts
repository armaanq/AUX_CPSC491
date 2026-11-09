import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  Prisma,
  ReportReason,
  Sentiment,
} from '../generated/prisma/client.js';
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
export const REPORT_REASONS = [
  'OFFENSIVE_PROFILE',
  'HARASSMENT',
  'SPAM',
  'OTHER',
] as const satisfies readonly ReportReason[];
export const REPORT_DETAILS_MAX = 500;

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

/** Someone you've blocked, listed so you can unblock them. */
export interface BlockedUser {
  id: string;
  username: string;
}

export interface ReportBody {
  reason?: unknown;
  details?: unknown;
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
  private readonly log = new Logger(FriendsService.name);

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
        ...visibleTo(me),
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

  /**
   * Anyone's profile: who they are, how you're connected, and their rankings.
   * Blocked either way, it looks like they aren't on AUX.
   */
  async profile(me: string, userId: string): Promise<ProfileResponse> {
    checkUserId(userId);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, ...visibleTo(me) },
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
      const block = await tx.block.findFirst({
        where: blockPairWhere(me, userId),
        select: { blockerId: true },
      });
      if (block?.blockerId === me) {
        throw new BadRequestException(
          'You blocked this listener. Unblock them in Profile settings first.',
        );
      }
      // Don't reveal that they blocked you.
      if (block) throw new NotFoundException('That listener isn’t on AUX.');
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

  /**
   * Blocks a user: you stop seeing each other in search and on profiles,
   * neither can send a friend request, and any friendship ends. Safe to repeat.
   */
  async block(me: string, userId: string): Promise<{ blocked: true }> {
    checkUserId(userId);
    if (userId === me) {
      throw new BadRequestException('You can’t block yourself.');
    }
    return this.prisma.$transaction(async (tx) => {
      // The same lock as friend requests, so a request can't land mid-block.
      const locked = await lockPair(tx, me, userId);
      if (locked < 2) throw new NotFoundException('That listener isn’t on AUX.');
      await tx.block.upsert({
        where: { blockerId_blockedId: { blockerId: me, blockedId: userId } },
        create: { blockerId: me, blockedId: userId },
        update: {},
      });
      await tx.friendship.deleteMany({ where: pairWhere(me, userId) });
      return { blocked: true as const };
    });
  }

  /** Lifts your block. Their block on you, if any, stays. Safe to repeat. */
  async unblock(me: string, userId: string): Promise<{ blocked: false }> {
    checkUserId(userId);
    await this.prisma.block.deleteMany({
      where: { blockerId: me, blockedId: userId },
    });
    return { blocked: false };
  }

  /** People you've blocked, most recent first. */
  async blocked(me: string): Promise<{ users: BlockedUser[] }> {
    const rows = await this.prisma.block.findMany({
      where: { blockerId: me },
      select: { blocked: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { users: rows.map((r) => r.blocked) };
  }

  /** Reports a user for the team to review. */
  async report(
    me: string,
    userId: string,
    body: ReportBody,
  ): Promise<{ reported: true }> {
    checkUserId(userId);
    if (userId === me) {
      throw new BadRequestException('You can’t report yourself.');
    }
    const { reason, details = '' } = body;
    if (!REPORT_REASONS.includes(reason as ReportReason)) {
      throw new BadRequestException(
        `reason must be one of: ${REPORT_REASONS.join(', ')}`,
      );
    }
    if (
      typeof details !== 'string' ||
      details.trim().length > REPORT_DETAILS_MAX
    ) {
      throw new BadRequestException(
        `Details must be text, at most ${REPORT_DETAILS_MAX} characters.`,
      );
    }
    const exists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('That listener isn’t on AUX.');
    const { id } = await this.prisma.report.create({
      data: {
        reporterId: me,
        reportedId: userId,
        reason: reason as ReportReason,
        details: details.trim(),
      },
      select: { id: true },
    });
    // Shows in Render's logs, so the team notices new reports.
    this.log.warn(`New report ${id} (${String(reason)}) about user ${userId}`);
    return { reported: true };
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

function blockPairWhere(a: string, b: string): Prisma.BlockWhereInput {
  return {
    OR: [
      { blockerId: a, blockedId: b },
      { blockerId: b, blockedId: a },
    ],
  };
}

/** Leaves out anyone you've blocked and anyone who has blocked you. */
function visibleTo(me: string): Prisma.UserWhereInput {
  return {
    blocking: { none: { blockedId: me } },
    blockedBy: { none: { blockerId: me } },
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
