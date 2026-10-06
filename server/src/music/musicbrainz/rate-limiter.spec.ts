import { RateLimitedError, RateLimiter } from './rate-limiter.js';

/** Fake clock: sleeping just moves time forward. */
function fakeClock() {
  let t = 1_000_000;
  const started: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    started,
    mark: () => started.push(t),
  };
}

describe('RateLimiter', () => {
  it('spaces calls at least intervalMs apart and runs them in order', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(1_100, 10, clock.now, clock.sleep);
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3, 4].map(n =>
        limiter.schedule(async () => {
          clock.mark();
          order.push(n);
        }),
      ),
    );
    expect(order).toEqual([1, 2, 3, 4]);
    const gaps = clock.started.slice(1).map((s, i) => s - clock.started[i]);
    expect(gaps.every(g => g >= 1_100)).toBe(true);
  });

  it('runs the first call immediately', async () => {
    const clock = fakeClock();
    const start = clock.now();
    const limiter = new RateLimiter(1_100, 10, clock.now, clock.sleep);
    await limiter.schedule(async () => clock.mark());
    expect(clock.started[0]).toBe(start);
  });

  it('rejects instead of queueing when the line is full', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(1_100, 2, clock.now, clock.sleep);
    const a = limiter.schedule(async () => 'a');
    const b = limiter.schedule(async () => 'b');
    await expect(limiter.schedule(async () => 'c')).rejects.toBeInstanceOf(RateLimitedError);
    await expect(Promise.all([a, b])).resolves.toEqual(['a', 'b']);
    // Line has drained, so new work is accepted again.
    await expect(limiter.schedule(async () => 'd')).resolves.toBe('d');
  });

  it('keeps going after a task fails', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(1_100, 5, clock.now, clock.sleep);
    await expect(limiter.schedule(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(limiter.schedule(async () => 'ok')).resolves.toBe('ok');
  });
});
