import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { IS_PUBLIC } from './public.decorator.js';

export type AuthedRequest = Request & { userId: string };

/** Registered globally: every route requires a valid login token unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly log = new Logger(AuthGuard.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token)
      throw new UnauthorizedException('Log in to continue.');

    const sub = await this.jwt.verifyAsync<{ sub?: string }>(token).then(
      (payload) => payload.sub,
      () => undefined,
    );
    if (!sub)
      throw new UnauthorizedException(
        'Your session has expired. Log in again.',
      );

    // A database outage must not look like a bad login: the app logs out on
    // 401, so it would sign out everyone using AUX at that moment.
    const user = await this.prisma.user
      .findUnique({ where: { id: sub }, select: { id: true } })
      .catch((err: Error) => {
        this.log.error(
          `Couldn't look up the logged-in account: ${err.message}`,
        );
        throw new ServiceUnavailableException(
          'AUX can’t reach its database right now. Try again in a moment.',
        );
      });
    if (!user)
      throw new UnauthorizedException(
        'This account no longer exists. Log in again.',
      );
    req.userId = sub;
    return true;
  }
}
