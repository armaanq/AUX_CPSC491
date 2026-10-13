import { useEffect, useState } from 'react';
import { getSongStats, type SongStats } from '../api/charts';

// AUX averages move as people rank, but not second to second.
const FRESH_MS = 5 * 60 * 1000;
const BATCH = 60;
const cache = new Map<string, { at: number; stats: SongStats | null }>();

/**
 * Everyone's average for each AUX song id, fetched in batches and cached for a
 * few minutes. Songs nobody has ranked map to null. Ids not yet loaded are absent.
 */
export function useSongStats(songIds: (string | undefined)[]) {
  const ids = [...new Set(songIds.filter((id): id is string => !!id))];
  const key = ids.sort().join(',');
  const read = () => {
    const out: Record<string, SongStats | null> = {};
    ids.forEach(id => {
      const hit = cache.get(id);
      if (hit) out[id] = hit.stats;
    });
    return out;
  };
  const [stats, setStats] = useState(read);

  useEffect(() => {
    const now = Date.now();
    const missing = key
      .split(',')
      .filter(id => id && !(cache.get(id) && now - cache.get(id)!.at < FRESH_MS));
    let current = true;
    if (!missing.length) {
      setStats(read());
      return;
    }
    const batches: string[][] = [];
    for (let i = 0; i < missing.length; i += BATCH)
      batches.push(missing.slice(i, i + BATCH));
    Promise.all(batches.map(getSongStats))
      .then(results => {
        const at = Date.now();
        missing.forEach(id => cache.set(id, { at, stats: null }));
        results.forEach(r =>
          r.stats.forEach(s => cache.set(s.songId, { at, stats: s })),
        );
        if (current) setStats(read());
      })
      // Without stats the screens just show your own score.
      .catch(() => {});
    return () => {
      current = false;
    };
    // `read` only depends on `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return stats;
}

/** Forgets loaded stats (after you rank, and in tests). */
export function clearSongStatsCache(songId?: string) {
  if (songId) cache.delete(songId);
  else cache.clear();
}
