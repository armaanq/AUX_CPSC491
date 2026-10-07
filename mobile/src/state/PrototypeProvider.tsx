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
  isCatalogMusic,
  music,
  registerMusic,
  people,
  type Music,
} from '../data/prototype';
export type Connection = 'friends' | 'incoming' | 'outgoing';
// Rankings live on the server now (see RankingsProvider); this is the rest of
// the prototype state, still kept on the device.
type State = {
  version: 4;
  // Real catalog songs the user saved or pinned, kept so they still
  // display after a restart (demo songs are built into the app).
  library: Music[];
  saved: string[];
  favorites: string[];
  connections: Record<string, Connection>;
  bio: string;
};
const initial: State = {
  version: 4,
  library: [],
  saved: ['a0', 'a3'],
  favorites: ['t7', 't4', 't2'],
  connections: {
    'u-shyan': 'friends',
    'u-ariang': 'friends',
    'u-maya': 'incoming',
  },
  bio: 'A little R&B. A lot of repeat listens.',
};
// v2: rankings carry a sentiment and are songs only.
// v3: adds `library` for real catalog songs.
// v4: rankings (and the activity list) moved to the server.
// Bumping the key means phones with older data start fresh instead of
// failing to load it.
const key = '@aux/prototype/v4';
const legacyKeys = [
  '@aux/prototype/v1',
  '@aux/prototype/v2',
  '@aux/prototype/v3',
];
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
    s.version === 4 &&
    Array.isArray(s.library) &&
    s.library.every(isCatalogMusic) &&
    typeof s.bio === 'string' &&
    ids(s.saved) &&
    ids(s.favorites) &&
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
  /** Takes a song off the listening queue (e.g. once it's ranked). */
  unsave: (id: string) => void;
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
        unsave: id =>
          setState(s =>
            s.saved.includes(id)
              ? { ...s, saved: s.saved.filter(x => x !== id) }
              : s,
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
