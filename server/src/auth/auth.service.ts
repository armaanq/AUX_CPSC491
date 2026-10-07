import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { selfSelect, type SelfUser } from '../users/users.service.js';
import { dummyHash, hashPassword, verifyPassword } from './password.js';

export interface AuthResponse {
  token: string;
  user: SelfUser;
}

export interface SignupBody {
  email?: unknown;
  username?: unknown;
  password?: unknown;
}

export interface LoginBody {
  /** Email or username. */
  identifier?: unknown;
  password?: unknown;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-z0-9_.]{3,20}$/;
export const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

/** Emails and usernames are case-insensitive, so they're stored lowercase. */
const normalized = (v: unknown) =>
  typeof v === 'string' ? v.trim().toLowerCase() : '';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async signup(body: SignupBody): Promise<AuthResponse> {
    const email = normalized(body.email);
    const username = normalized(body.username);
    const { password } = body;
    if (email.length > 254 || !EMAIL.test(email)) {
      throw new BadRequestException('Enter a valid email address.');
    }
    if (!USERNAME.test(username)) {
      throw new BadRequestException(
        'Usernames are 3–20 characters: letters, numbers, underscores and periods.',
      );
    }
    if (
      typeof password !== 'string' ||
      password.length < PASSWORD_MIN ||
      password.length > PASSWORD_MAX
    ) {
      throw new BadRequestException(
        `Passwords need ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`,
      );
    }

    const taken = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { email: true },
    });
    if (taken) {
      throw new ConflictException(
        taken.email === email
          ? 'An account with that email already exists.'
          : 'That username is taken.',
      );
    }

    try {
      const user = await this.prisma.user.create({
        data: { email, username, passwordHash: await hashPassword(password) },
        select: selfSelect,
      });
      return this.session(user);
    } catch (err) {
      // Someone else claimed the email or username between the check above and now.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'That email or username was just taken. Try another.',
        );
      }
      throw err;
    }
  }

  async login(body: LoginBody): Promise<AuthResponse> {
    const identifier = normalized(body.identifier);
    const password =
      typeof body.password === 'string' && body.password.length <= PASSWORD_MAX
        ? body.password
        : '';
    const found = identifier
      ? await this.prisma.user.findUnique({
          // Usernames can't contain "@", so this can't be ambiguous.
          where: identifier.includes('@')
            ? { email: identifier }
            : { username: identifier },
          select: { ...selfSelect, passwordHash: true },
        })
      : null;

    const valid = await verifyPassword(
      password,
      found?.passwordHash ?? (await dummyHash()),
    );
    // Same message either way, so it doesn't reveal which emails/usernames exist.
    if (!found || !valid)
      throw new UnauthorizedException('Incorrect email/username or password.');

    const { passwordHash: _hash, ...user } = found;
    return this.session(user);
  }

  private async session(user: SelfUser): Promise<AuthResponse> {
    return { token: await this.jwt.signAsync({ sub: user.id }), user };
  }
}
