import {
  ServiceUnavailableException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthGuard, type AuthedRequest } from './auth.guard.js';
import { jwtOptions } from './auth.module.js';

process.env.JWT_SECRET = 'test-secret-'.padEnd(40, 'x');
const jwt = new JwtService(jwtOptions());

function run(
  authorization: string | undefined,
  isPublic = false,
  findUser = vi.fn().mockResolvedValue({ id: 'user-1' }),
) {
  const req = { headers: { authorization } } as unknown as AuthedRequest;
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;
  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  const prisma = { user: { findUnique: findUser } } as unknown as PrismaService;
  return {
    result: new AuthGuard(jwt, reflector, prisma).canActivate(ctx),
    req,
  };
}

describe('AuthGuard', () => {
  it('rejects a valid token for a deleted account', async () => {
    const token = await jwt.signAsync({ sub: 'user-1' });
    const gone = vi.fn().mockResolvedValue(null);
    await expect(run(`Bearer ${token}`, false, gone).result).rejects.toThrow(
      'This account no longer exists',
    );
  });

  it('answers a database outage with 503, not a 401 that would log people out', async () => {
    const token = await jwt.signAsync({ sub: 'user-1' });
    const down = vi.fn().mockRejectedValue(new Error('connection refused'));
    const { result } = run(`Bearer ${token}`, false, down);
    await expect(result).rejects.toThrow(ServiceUnavailableException);
    await expect(result).rejects.not.toThrow(UnauthorizedException);
  });

  it('lets public routes through without a token', async () => {
    await expect(run(undefined, true).result).resolves.toBe(true);
  });

  it('accepts a valid token and records who is logged in', async () => {
    const token = await jwt.signAsync({ sub: 'user-1' });
    const { result, req } = run(`Bearer ${token}`);
    await expect(result).resolves.toBe(true);
    expect(req.userId).toBe('user-1');
  });

  it.each([
    ['no header', undefined],
    ['wrong scheme', 'Basic abc'],
    ['empty token', 'Bearer '],
    ['garbage', 'Bearer not.a.token'],
  ])('rejects %s', async (_, header) => {
    await expect(run(header).result).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token signed with a different secret', async () => {
    const forged = await new JwtService({
      secret: 'another-secret-'.padEnd(40, 'y'),
    }).signAsync({ sub: 'user-1' });
    await expect(run(`Bearer ${forged}`).result).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with a different algorithm, even with the right secret', async () => {
    const other = await new JwtService({
      secret: process.env.JWT_SECRET,
    }).signAsync({ sub: 'user-1' }, { algorithm: 'HS512' });
    await expect(run(`Bearer ${other}`).result).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an expired token', async () => {
    const expired = await new JwtService({
      secret: process.env.JWT_SECRET,
    }).signAsync({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    await expect(run(`Bearer ${expired}`).result).rejects.toThrow(
      'Your session has expired',
    );
  });
});
