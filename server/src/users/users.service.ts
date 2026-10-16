import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** What a user may see about their own account. Never includes passwordHash. */
export const selfSelect = {
  id: true,
  email: true,
  username: true,
  bio: true,
  avatarUrl: true,
  favoriteGenres: true,
  onboardedAt: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

export type SelfUser = Prisma.UserGetPayload<{ select: typeof selfSelect }>;

export interface ProfileBody {
  bio?: unknown;
}

export const BIO_MAX = 160;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findSelf(id: string): Promise<SelfUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: selfSelect,
    });
    // A valid token for a deleted account.
    if (!user)
      throw new UnauthorizedException(
        'This account no longer exists. Log in again.',
      );
    return user;
  }

  /** Edits what other people see on your profile. Only the bio, for now. */
  async updateProfile(id: string, body: ProfileBody): Promise<SelfUser> {
    const { bio } = body;
    if (typeof bio !== 'string') {
      throw new BadRequestException('bio must be text');
    }
    const trimmed = bio.trim();
    if (trimmed.length > BIO_MAX) {
      throw new BadRequestException(`Bios are ${BIO_MAX} characters at most.`);
    }
    await this.findSelf(id);
    return this.prisma.user.update({
      where: { id },
      data: { bio: trimmed },
      select: selfSelect,
    });
  }

  /** Marks first-run setup done. Safe to repeat: the first time is kept. */
  async completeOnboarding(id: string): Promise<SelfUser> {
    const user = await this.findSelf(id);
    if (user.onboardedAt) return user;
    return this.prisma.user.update({
      where: { id },
      data: { onboardedAt: new Date() },
      select: selfSelect,
    });
  }
}
