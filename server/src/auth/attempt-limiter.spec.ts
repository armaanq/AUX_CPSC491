import { HttpStatus, type ExecutionContext } from '@nestjs/common';
import { AttemptLimiter, tooManyAttempts } from './attempt-limiter.js';
import {
  AUTH_REQUESTS_PER_IP,
  AuthRateLimitGuard,
} from './auth-rate-limit.guard.js';

describe('AttemptLimiter', () => {
  it('allows up to the limit, then says how long to wait until the window ends', () => {
    let now = 0;
    const limiter = new AttemptLimiter(3, 60_000, () => now);
    for (let i = 0; i < 3; i++) {
      expect(limiter.retryAfter('ip')).toBe(0);
      limiter.record('ip');
    }
    expect(limiter.retryAfter('ip')).toBe(60);
    now = 45_000;
    expect(limiter.retryAfter('ip')).toBe(15);
    // Other keys have their own count.
    expect(limiter.retryAfter('other')).toBe(0);
    now = 60_000;
    expect(limiter.retryAfter('ip')).toBe(0);
  });

  it('starts over once a key is cleared', () => {
    const limiter = new AttemptLimiter(1, 60_000, () => 0);
    limiter.record('account');
    expect(limiter.retryAfter('account')).toBeGreaterThan(0);
    limiter.clear('account');
    expect(limiter.retryAfter('account')).toBe(0);
  });

  it('answers with a 429 in minutes', () => {
    const err = tooManyAttempts(61);
    expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(err.message).toBe('Too many attempts. Try again in 2 minutes.');
    expect(tooManyAttempts(5).message).toBe(
      'Too many attempts. Try again in 1 minute.',
    );
  });
});

describe('AuthRateLimitGuard', () => {
  function call(guard: AuthRateLimitGuard, ip: string) {
    const res = { setHeader: vi.fn() };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ ip }),
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;
    return { run: () => guard.canActivate(ctx), res };
  }

  it('stops one address after the limit and tells it when to retry', () => {
    const guard = new AuthRateLimitGuard();
    for (let i = 0; i < AUTH_REQUESTS_PER_IP; i++) {
      expect(call(guard, '1.2.3.4').run()).toBe(true);
    }
    const blocked = call(guard, '1.2.3.4');
    expect(blocked.run).toThrow('Too many attempts');
    expect(blocked.res.setHeader).toHaveBeenCalledWith(
      'Retry-After',
      expect.any(String),
    );
    // Someone else on a different network is unaffected.
    expect(call(guard, '5.6.7.8').run()).toBe(true);
  });
});
