import { useEffect, useState } from 'react';
import { getCharts } from '../api/charts';
import {
  musicFromAlbum,
  musicFromSearch,
  registerMusic,
  type Music,
} from '../data/prototype';

export type Charts = {
  status: 'loading' | 'done' | 'error';
  songs: Music[];
  albums: Music[];
  error?: string;
};

// Charts change through the day, not by the minute: switching tabs or genres
// within this window reuses what's already loaded.
const FRESH_MS = 15 * 60 * 1000;
const loaded = new Map<string, { at: number; songs: Music[]; albums: Music[] }>();

/** Apple Music's top songs and albums, overall or for one genre id. */
export function useCharts(genre?: string): Charts {
  const key = genre ?? 'all';
  const cached = loaded.get(key);
  const fresh = cached && Date.now() - cached.at < FRESH_MS ? cached : null;
  const [charts, setCharts] = useState<Charts & { key: string }>(() =>
    fresh
      ? { key, status: 'done', songs: fresh.songs, albums: fresh.albums }
      : { key, status: 'loading', songs: [], albums: [] },
  );

  useEffect(() => {
    const hit = loaded.get(key);
    if (hit && Date.now() - hit.at < FRESH_MS) {
      setCharts({ key, status: 'done', songs: hit.songs, albums: hit.albums });
      return;
    }
    let current = true;
    setCharts({ key, status: 'loading', songs: [], albums: [] });
    getCharts(genre)
      .then(({ songs, albums }) => {
        const songItems = songs.map(musicFromSearch);
        const albumItems = albums.map(musicFromAlbum);
        registerMusic([...songItems, ...albumItems]);
        loaded.set(key, { at: Date.now(), songs: songItems, albums: albumItems });
        if (current) {
          setCharts({ key, status: 'done', songs: songItems, albums: albumItems });
        }
      })
      .catch((err: Error) => {
        if (current) {
          setCharts({
            key,
            status: 'error',
            songs: [],
            albums: [],
            error: err.message,
          });
        }
      });
    return () => {
      current = false;
    };
  }, [key, genre]);

  // Until the effect catches up with a new genre, report it as loading.
  return charts.key === key
    ? charts
    : { status: 'loading', songs: [], albums: [] };
}

/** Forgets loaded charts (tests). */
export function clearChartsCache() {
  loaded.clear();
}
