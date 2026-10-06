/**
 * Small in-memory cache with expiry and a size cap (oldest entry evicted).
 * Per server process and lost on restart, which is fine for search results:
 * its job is to keep repeat searches from spending the 1 req/s MusicBrainz budget.
 */
export class TtlCache<V> {
  private readonly map = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Re-insert so Map order tracks recent use (least recently used goes first).
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.map.size > this.maxEntries) {
      this.map.delete(this.map.keys().next().value!);
    }
  }

  get size(): number {
    return this.map.size;
  }
}
