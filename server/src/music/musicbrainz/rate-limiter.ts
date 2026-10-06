export class RateLimitedError extends Error {
  constructor() {
    super('MusicBrainz request queue is full');
  }
}

/**
 * Spaces calls at least `intervalMs` apart, one at a time, across the whole
 * process. MusicBrainz allows ~1 request/second per client and blocks IPs that
 * go over, so every request to it must go through one shared instance.
 *
 * If more than `maxQueue` calls are already waiting, new calls are rejected
 * right away with RateLimitedError instead of piling up, so a burst of
 * searches fails fast (and falls back) rather than hanging for many seconds.
 */
export class RateLimiter {
  private nextSlot = 0;
  private tail: Promise<void> = Promise.resolve();
  private waiting = 0;

  constructor(
    private readonly intervalMs: number,
    private readonly maxQueue: number,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = ms =>
      new Promise(resolve => setTimeout(resolve, ms)),
  ) {}

  get pending(): number {
    return this.waiting;
  }

  schedule<T>(task: () => Promise<T>): Promise<T> {
    if (this.waiting >= this.maxQueue) {
      return Promise.reject(new RateLimitedError());
    }
    this.waiting++;
    const turn = this.tail.then(async () => {
      const wait = this.nextSlot - this.now();
      if (wait > 0) await this.sleep(wait);
      this.nextSlot = this.now() + this.intervalMs;
      this.waiting--;
    });
    this.tail = turn;
    return turn.then(task);
  }
}
