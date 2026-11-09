import { HttpException, HttpStatus } from '@nestjs/common';

/** How long login and signup limits last before they reset. */
export const AUTH_WINDOW_MS = 15 * 60 * 1000;

/**
 * Counts attempts per key (an IP address, an account) in fixed windows.
 * Kept in memory, so counts reset on deploy and each server instance keeps
 * its own: fine for AUX's single Render instance. Move to Redis if that changes.
 */
export class AttemptLimiter {
  private readonly windows = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Seconds until `key` may try again, or 0 while it's under the limit. */
  retryAfter(key: string): number {
    const window = this.windows.get(key);
    const now = this.now();
    if (!window || window.resetAt <= now || window.count < this.max) return 0;
    return Math.ceil((window.resetAt - now) / 1000);
  }

  /** Counts one attempt against `key`. */
  record(key: string): void {
    const now = this.now();
    const window = this.windows.get(key);
    if (window && window.resetAt > now) {
      window.count++;
      return;
    }
    this.prune(now);
    this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
  }

  /** Forgets `key`'s attempts, e.g. after a successful login. */
  clear(key: string): void {
    this.windows.delete(key);
  }

  /** Drops expired windows once there are many, so memory can't grow without bound. */
  private prune(now: number) {
    if (this.windows.size < 10_000) return;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}

/** A 429 the app shows as-is (it only logs people out on 401). */
export function tooManyAttempts(retryAfterS: number): HttpException {
  const minutes = Math.max(1, Math.ceil(retryAfterS / 60));
  return new HttpException(
    `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
