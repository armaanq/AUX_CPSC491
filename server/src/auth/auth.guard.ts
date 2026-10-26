import {
  Injectable,
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

    try {
      const { sub } = await this.jwt.verifyAsync<{ sub: string }>(token);
      if (!sub || !(await this.prisma.user.findUnique({ where: { id: sub }, select: { id: true } })))
        throw new UnauthorizedException('This account no longer exists.');
      req.userId = sub;
      return true;
    } catch {
      throw new UnauthorizedException(
        'Your session has expired. Log in again.',
      );
    }
  }
}
