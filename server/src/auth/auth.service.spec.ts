import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { jwtOptions } from './auth.module.js';
import { AuthService } from './auth.service.js';
import { hashPassword } from './password.js';

process.env.JWT_SECRET = 'test-secret-'.padEnd(40, 'x');
const jwt = new JwtService(jwtOptions());

const account = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'armaan@example.com',
  username: 'armaan',
  bio: '',
  avatarUrl: null,
  favoriteGenres: [],
  createdAt: new Date('2026-10-06T00:00:00Z'),
};

function setup() {
  const prisma = {
    user: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...account,
          email: data.email,
          username: data.username,
        }),
      ),
    },
  };
  return {
    service: new AuthService(prisma as unknown as PrismaService, jwt),
    prisma,
  };
}

const valid = {
  email: 'Armaan@Example.com ',
  username: ' Armaan',
  password: 'longenough',
};

describe('AuthService.signup', () => {
  it('creates the account with a hashed password and returns a login token', async () => {
    const { service, prisma } = setup();
    const { token, user } = await service.signup(valid);

    const { data } = prisma.user.create.mock.calls[0][0];
    expect(data.email).toBe('armaan@example.com');
    expect(data.username).toBe('armaan');
    expect(data.passwordHash).toMatch(/^scrypt\$/);
    expect(data.passwordHash).not.toContain('longenough');
    expect(user).not.toHaveProperty('passwordHash');
    expect((await jwt.verifyAsync<{ sub: string }>(token)).sub).toBe(
      account.id,
    );
  });

  it.each([
    [{ ...valid, email: 'not-an-email' }, 'valid email'],
    [{ ...valid, email: undefined }, 'valid email'],
    [{ ...valid, username: 'ab' }, 'Usernames are 3–20'],
    [{ ...valid, username: 'has space' }, 'Usernames are 3–20'],
    [{ ...valid, username: 'a@b' }, 'Usernames are 3–20'],
    [{ ...valid, password: 'short' }, 'Passwords need 8'],
    [{ ...valid, password: 12345678 }, 'Passwords need 8'],
    [{ ...valid, password: 'x'.repeat(129) }, 'Passwords need 8'],
  ])(
    'rejects bad input %# without touching the database',
    async (body, message) => {
      const { service, prisma } = setup();
      await expect(service.signup(body)).rejects.toThrow(BadRequestException);
      await expect(service.signup(body)).rejects.toThrow(message);
      expect(prisma.user.create).not.toHaveBeenCalled();
    },
  );

  it('says which of email or username is already taken', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValueOnce({
      email: 'armaan@example.com',
    });
    await expect(service.signup(valid)).rejects.toThrow(
      'An account with that email already exists.',
    );

    prisma.user.findFirst.mockResolvedValueOnce({
      email: 'someone-else@example.com',
    });
    await expect(service.signup(valid)).rejects.toThrow(
      'That username is taken.',
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('turns a simultaneous signup for the same name into a conflict, not a crash', async () => {
    const { service, prisma } = setup();
    prisma.user.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(service.signup(valid)).rejects.toThrow(ConflictException);
  });
});

describe('AuthService.login', () => {
  async function withAccount() {
    const ctx = setup();
    const passwordHash = await hashPassword('longenough');
    ctx.prisma.user.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(
        where.email === account.email || where.username === account.username
          ? { ...account, passwordHash }
          : null,
      ),
    );
    return ctx;
  }

  it('logs in with a username or an email, ignoring case and spaces', async () => {
    const { service } = await withAccount();
    for (const identifier of ['armaan', ' ARMAAN ', 'Armaan@Example.com']) {
      const { token, user } = await service.login({
        identifier,
        password: 'longenough',
      });
      expect(user.username).toBe('armaan');
      expect(user).not.toHaveProperty('passwordHash');
      expect((await jwt.verifyAsync<{ sub: string }>(token)).sub).toBe(
        account.id,
      );
    }
  });

  it('gives the same error for a wrong password and an unknown account', async () => {
    const { service } = await withAccount();
    const wrongPassword = service.login({
      identifier: 'armaan',
      password: 'not-it-at-all',
    });
    const unknownUser = service.login({
      identifier: 'nobody',
      password: 'longenough',
    });
    await expect(wrongPassword).rejects.toThrow(UnauthorizedException);
    await expect(unknownUser).rejects.toThrow(UnauthorizedException);
    await expect(wrongPassword).rejects.toThrow(
      'Incorrect email/username or password.',
    );
    await expect(unknownUser).rejects.toThrow(
      'Incorrect email/username or password.',
    );
  });

  it('rejects a missing identifier or password', async () => {
    const { service, prisma } = await withAccount();
    await expect(service.login({ password: 'longenough' })).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.login({ identifier: 'armaan' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('jwtOptions', () => {
  it('refuses to start without a long enough secret', () => {
    const saved = process.env.JWT_SECRET;
    try {
      delete process.env.JWT_SECRET;
      expect(() => jwtOptions()).toThrow(/JWT_SECRET/);
      process.env.JWT_SECRET = 'too-short';
      expect(() => jwtOptions()).toThrow(/JWT_SECRET/);
    } finally {
      process.env.JWT_SECRET = saved;
    }
  });
});
