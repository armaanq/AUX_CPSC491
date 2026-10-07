import { Injectable, UnauthorizedException } from '@nestjs/common';
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
  createdAt: true,
} as const satisfies Prisma.UserSelect;

export type SelfUser = Prisma.UserGetPayload<{ select: typeof selfSelect }>;

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
}
