import { TtlCache } from './ttl-cache.js';

describe('TtlCache', () => {
  it('expires entries after the TTL', () => {
    let t = 0;
    const cache = new TtlCache<string>(100, 10, () => t);
    cache.set('a', 'x');
    t = 99;
    expect(cache.get('a')).toBe('x');
    t = 100;
    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts the least recently used entry when full', () => {
    const cache = new TtlCache<number>(1_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // a is now more recent than b
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });
});
