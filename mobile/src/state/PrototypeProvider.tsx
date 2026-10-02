import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import {
  findMusic,
  initialRankings,
  insertRanking,
  isCatalogMusic,
  music,
  registerMusic,
  people,
  SENTIMENT_ORDER,
  type Music,
  type Ranking,
  type Sentiment,
} from '../data/prototype';
export type Connection = 'friends' | 'incoming' | 'outgoing';
type State = {
  version: 3;
  // Real catalog songs the user ranked, saved or pinned, kept so they still
  // display after a restart (demo songs are built into the app).
  library: Music[];
  rankings: Ranking[];
  saved: string[];
  favorites: string[];
  connections: Record<string, Connection>;
  bio: string;
  activity: string[];
};
const initial: State = {
  version: 3,
  library: [],
  rankings: initialRankings,
  saved: ['a0', 'a3'],
  favorites: ['t7', 't4', 't2'],
  connections: {
    'u-shyan': 'friends',
    'u-ariang': 'friends',
    'u-maya': 'incoming',
  },
  bio: 'A little R&B. A lot of repeat listens.',
  activity: [],
};
// v2: rankings carry a sentiment and are songs only.
// v3: adds `library` for real catalog songs.
// Bumping the key means phones with older data start fresh instead of
// failing to load it.
const key = '@aux/prototype/v3';
const legacyKeys = ['@aux/prototype/v1', '@aux/prototype/v2'];
/** Adds a catalog song to the library the first time the user acts on it. */
function remember(library: Music[], id: string): Music[] {
  const item = findMusic(id);
  return item?.source && !library.some(m => m.id === id)
    ? [...library, item]
    : library;
}
export function validState(value: unknown): value is State {
  if (!value || typeof value !== 'object') return false;
  const s = value as State;
  const ids = (v: unknown) =>
    Array.isArray(v) &&
    v.every(id => typeof id === 'string' && music.some(m => m.id === id));
  return (
    s.version === 3 &&
    Array.isArray(s.library) &&
    s.library.every(isCatalogMusic) &&
    typeof s.bio === 'string' &&
    ids(s.saved) &&
    ids(s.favorites) &&
    ids(s.activity) &&
    Array.isArray(s.rankings) &&
    s.rankings.every(
      r =>
        r &&
        music.some(m => m.id === r.musicId && m.kind === 'song') &&
        SENTIMENT_ORDER.includes(r.sentiment) &&
        Number.isFinite(r.score) &&
        r.score >= 0 &&
        r.score <= 10,
    ) &&
    !!s.connections &&
    typeof s.connections === 'object' &&
    Object.entries(s.connections).every(
      ([id, status]) =>
        people.some(p => p.id === id) &&
        ['friends', 'incoming', 'outgoing'].includes(status),
    )
  );
}
type API = {
  state: State;
  error: string | null;
  toggleSaved: (id: string) => void;
  toggleFavorite: (id: string) => void;
  connect: (id: string, action: 'request' | 'accept' | 'remove') => void;
  rank: (id: string, sentiment: Sentiment, index: number) => void;
  setBio: (bio: string) => void;
};
const Context = createContext<API | null>(null);
export function PrototypeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    AsyncStorage.multiRemove(legacyKeys).catch(() => {});
    AsyncStorage.getItem(key)
      .then(raw => {
        if (!active || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        // Catalog songs must be findable before the rankings that use them
        // are validated.
        const library = (parsed as Partial<State> | null)?.library;
        if (Array.isArray(library))
          registerMusic(library.filter(isCatalogMusic));
        if (validState(parsed)) setState(parsed);
        else
          setError(
            'Saved demo data could not be restored. Starting with the sample library.',
          );
      })
      .catch(() => {
        if (active)
          setError(
            'Could not restore your library. Changes will still work this session.',
          );
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    writes.current = writes.current
      .then(() => AsyncStorage.setItem(key, JSON.stringify(state)))
      .catch(() => setError('Could not save your changes on this device.'));
  }, [state, ready]);
  if (!ready)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#F8F6F1',
        }}
      >
        <ActivityIndicator />
        <Text>Opening your collection…</Text>
      </View>
    );
  return (
    <Context.Provider
      value={{
        state,
        error,
        toggleSaved: id =>
          setState(s => ({
            ...s,
            library: remember(s.library, id),
            saved: s.saved.includes(id)
              ? s.saved.filter(x => x !== id)
              : [...s.saved, id],
          })),
        toggleFavorite: id =>
          setState(s => ({
            ...s,
            library: remember(s.library, id),
            favorites: s.favorites.includes(id)
              ? s.favorites.filter(x => x !== id)
              : [...s.favorites, id],
          })),
        connect: (id, action) =>
          setState(s => {
            const connections = { ...s.connections };
            if (action === 'remove') delete connections[id];
            else if (action === 'accept' && connections[id] === 'incoming')
              connections[id] = 'friends';
            else if (action === 'request' && !connections[id])
              connections[id] = 'outgoing';
            return { ...s, connections };
          }),
        rank: (id, sentiment, index) =>
          setState(s =>
            // Only songs can be ranked; ignore anything else.
            findMusic(id)?.kind !== 'song'
              ? s
              : {
                  ...s,
                  library: remember(s.library, id),
                  rankings: insertRanking(s.rankings, id, sentiment, index),
                  saved: s.saved.filter(x => x !== id),
                  activity: [id, ...s.activity.filter(x => x !== id)].slice(
                    0,
                    20,
                  ),
                },
          ),
        setBio: bio => setState(s => ({ ...s, bio })),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePrototype() {
  const value = useContext(Context);
  if (!value) throw new Error('PrototypeProvider is required');
  return value;
}
