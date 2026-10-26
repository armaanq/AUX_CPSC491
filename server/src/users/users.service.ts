import {
  BadRequestException,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyPassword } from '../auth/password.js';
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
  avatarUrl?: unknown;
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

  /** Save small raster avatars directly with the account so they survive reinstalls. */
  async updateProfile(id: string, body: ProfileBody): Promise<SelfUser> {
    const data: { bio?: string; avatarUrl?: string | null } = {};
    if (body.bio !== undefined) {
      if (typeof body.bio !== 'string' || body.bio.trim().length > BIO_MAX)
        throw new BadRequestException(`Bios must be text, at most ${BIO_MAX} characters.`);
      data.bio = body.bio.trim();
    }
    if (body.avatarUrl !== undefined) {
      const value = body.avatarUrl;
      if (value === null) data.avatarUrl = null;
      else {
        if (typeof value !== 'string' || value.length > 350000)
          throw new BadRequestException('Choose a photo smaller than 256 KB.');
        const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
        if (!match) throw new BadRequestException('Choose a JPEG or PNG photo.');
        const bytes = Buffer.from(match[2], 'base64');
        const valid = match[1] === 'jpeg'
          ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
          : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        if (!valid || bytes.length > 256 * 1024 || bytes.toString('base64') !== match[2])
          throw new BadRequestException('Choose a valid JPEG or PNG smaller than 256 KB.');
        data.avatarUrl = value;
      }
    }
    if (!Object.keys(data).length) throw new BadRequestException('No profile changes supplied.');
    await this.findSelf(id);
    return this.prisma.user.update({ where: { id }, data, select: selfSelect });
  }

  async deleteAccount(id: string, password: unknown): Promise<{ deleted: true }> {
    if (typeof password !== 'string' || !password || password.length > 1024)
      throw new BadRequestException('Enter your current password.');
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new UnauthorizedException('This account no longer exists.');
    if (!(await verifyPassword(password, user.passwordHash)))
      throw new ForbiddenException('Your password is incorrect.');
    // Foreign keys cascade to rankings, saved items, favorites, and both sides of friendships.
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
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
