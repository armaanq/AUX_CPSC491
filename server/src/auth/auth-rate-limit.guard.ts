import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AttemptLimiter,
  AUTH_WINDOW_MS,
  tooManyAttempts,
} from './attempt-limiter.js';

/**
 * Login and signup requests per IP address per window. Generous on purpose:
 * a whole class on campus Wi-Fi shares one address. Guessing one account's
 * password is limited separately, per account (see AuthService.login).
 */
export const AUTH_REQUESTS_PER_IP = 100;

/** Slows down scripts hammering /auth from one address. */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  readonly perIp = new AttemptLimiter(AUTH_REQUESTS_PER_IP, AUTH_WINDOW_MS);

  canActivate(ctx: ExecutionContext): boolean {
    const http = ctx.switchToHttp();
    // The real client address: main.ts trusts Render's proxy for X-Forwarded-For.
    const ip = http.getRequest<Request>().ip ?? 'unknown';
    const wait = this.perIp.retryAfter(ip);
    if (wait) {
      http.getResponse<Response>().setHeader('Retry-After', String(wait));
      throw tooManyAttempts(wait);
    }
    this.perIp.record(ip);
    return true;
  }
}
