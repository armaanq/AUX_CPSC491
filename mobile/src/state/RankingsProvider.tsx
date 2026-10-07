import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  getRankings,
  placeRanking,
  type RankingsResponse,
} from '../api/rankings';
import { resolveSong } from '../api/songs';
import {
  findMusic,
  insertRanking,
  musicFromSearch,
  registerMusic,
  type Ranking,
  type Sentiment,
} from '../data/prototype';
import { useAuth } from './AuthProvider';

type API = {
  /** The logged-in user's rankings, best first. */
  rankings: Ranking[];
  /** Ranked songs, most recently ranked first. */
  recent: string[];
  loading: boolean;
  error: string | null;
  /** Shows the change right away, then saves it to the server. */
  rank: (musicId: string, sentiment: Sentiment, index: number) => void;
  reload: () => Promise<void>;
};

const Context = createContext<API | null>(null);

export function RankingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  // Whose rankings are on screen; derived so it's right on every render.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loading = userId !== null && loadedFor !== userId;
  const [error, setError] = useState<string | null>(null);
  // App music id ("mb:<mbid>") -> AUX song id, so each song is resolved once.
  const songIds = useRef(new Map<string, string>());
  // Saves run one at a time, in the order the user made them.
  const writes = useRef(Promise.resolve());
  // Answers that arrive after logging out (or into another account) are dropped.
  const owner = useRef(userId);
  owner.current = userId;

  const adopt = useCallback(
    (forUser: string, { rankings: list }: RankingsResponse) => {
      if (owner.current !== forUser) return;
      const items = list.map(r =>
        musicFromSearch({ ...r.song, songId: r.song.id }),
      );
      registerMusic(items);
      list.forEach((r, i) => songIds.current.set(items[i].id, r.song.id));
      setRankings(
        list.map((r, i) => ({
          musicId: items[i].id,
          sentiment: r.sentiment,
          score: r.score,
        })),
      );
      setRecent(
        list
          .map((r, i) => ({ id: items[i].id, at: r.rankedAt }))
          .sort((a, b) => b.at.localeCompare(a.at))
          .map(r => r.id),
      );
    },
    [],
  );

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      adopt(userId, await getRankings());
      if (owner.current === userId) setError(null);
    } catch (err) {
      if (owner.current === userId)
        setError(`Couldn't load your rankings. ${(err as Error).message}`);
    } finally {
      // Even after a failure, so screens show the error instead of waiting forever.
      if (owner.current === userId) setLoadedFor(userId);
    }
  }, [userId, adopt]);

  useEffect(() => {
    setRankings([]);
    setRecent([]);
    setError(null);
    songIds.current.clear();
    reload();
  }, [userId, reload]);

  const rank = useCallback(
    (musicId: string, sentiment: Sentiment, index: number) => {
      const item = findMusic(musicId);
      // Only real catalog songs can be saved; built-in samples aren't in AUX's database.
      if (!userId || item?.kind !== 'song' || !item.source || !item.externalId)
        return;
      const { source, externalId } = item;
      setRankings(current => insertRanking(current, musicId, sentiment, index));
      setRecent(current => [musicId, ...current.filter(id => id !== musicId)]);
      writes.current = writes.current.then(async () => {
        try {
          let songId = songIds.current.get(musicId);
          if (!songId) {
            songId = (await resolveSong(source, externalId)).id;
            songIds.current.set(musicId, songId);
          }
          adopt(userId, await placeRanking(songId, sentiment, index));
        } catch (err) {
          if (owner.current !== userId) return;
          // Put the list back the way the server has it.
          await getRankings()
            .then(saved => adopt(userId, saved))
            .catch(() => {});
          setError(`Couldn't save your ranking. ${(err as Error).message}`);
        }
      });
    },
    [userId, adopt],
  );

  return (
    <Context.Provider
      value={{ rankings, recent, loading, error, rank, reload }}
    >
      {children}
    </Context.Provider>
  );
}

export function useRankings() {
  const value = useContext(Context);
  if (!value) throw new Error('RankingsProvider is required');
  return value;
}

/** For shared layout (Page): the current rankings error, if a provider is mounted. */
export function useRankingsError() {
  return useContext(Context)?.error ?? null;
}
