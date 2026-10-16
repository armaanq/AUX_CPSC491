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
  type Music,
} from '../data/prototype';
import { useUserId } from './AuthProvider';
// Rankings, your bio and friends live on the server now; this is the rank
// queue, still kept on the device (one per account).
type State = {
  version: 5;
  // Real catalog songs the user queued, kept so they still display after a
  // restart (demo songs are built into the app).
  library: Music[];
  saved: string[];
};
const empty: State = { version: 5, library: [], saved: [] };
// v5: one queue per account (v4 was one per phone, shared by every account).
const keyFor = (userId: string | null) => `@aux/queue/v5/${userId ?? 'guest'}`;
// The first account to open the app after the update keeps the v4 queue.
const v4Key = '@aux/prototype/v4';
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
const known = (id: unknown) =>
  typeof id === 'string' && music.some(m => m.id === id);
export function validState(value: unknown): value is State {
  if (!value || typeof value !== 'object') return false;
  const s = value as State;
  return (
    s.version === 5 &&
    Array.isArray(s.library) &&
    s.library.every(isCatalogMusic) &&
    Array.isArray(s.saved) &&
    s.saved.every(known)
  );
}
/** Reads a saved queue, registering its catalog songs so their ids resolve. */
function restore(raw: string): State | null {
  const parsed = JSON.parse(raw) as {
    version?: number;
    library?: unknown;
    saved?: unknown;
  } | null;
  const library = Array.isArray(parsed?.library)
    ? parsed.library.filter(isCatalogMusic)
    : [];
  registerMusic(library);
  if (parsed?.version === 4 && Array.isArray(parsed.saved)) {
    // v4 also held favorites, demo friends and a bio; only the queue carries over.
    return { version: 5, library, saved: parsed.saved.filter(known) };
  }
  return validState(parsed) ? parsed : null;
}
type API = {
  state: State;
  error: string | null;
  toggleSaved: (id: string) => void;
  /** Takes a song off the listening queue (e.g. once it's ranked). */
  unsave: (id: string) => void;
  /** Adds songs to the end of the rank queue, skipping ones already there. */
  enqueue: (ids: string[]) => void;
};
const Context = createContext<API | null>(null);
export function PrototypeProvider({ children }: { children: React.ReactNode }) {
  const userId = useUserId();
  const key = keyFor(userId);
  const [state, setState] = useState(empty);
  // Which account's queue is loaded; saves only go to that account's key.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const writes = useRef(Promise.resolve());
  const ready = loadedKey === key;
  useEffect(() => {
    let active = true;
    AsyncStorage.multiRemove(legacyKeys).catch(() => {});
    (async () => {
      let next = empty;
      let problem: string | null = null;
      try {
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          next = restore(raw) ?? empty;
          if (next === empty)
            problem = 'Your saved queue could not be restored. Starting fresh.';
        } else if (userId) {
          const old = await AsyncStorage.getItem(v4Key);
          if (old) {
            next = restore(old) ?? empty;
            await AsyncStorage.removeItem(v4Key);
          }
        }
      } catch {
        problem = 'Could not restore your queue. Changes will still work this session.';
      }
      if (!active) return;
      setState(next);
      setError(problem);
      setLoadedKey(key);
    })();
    return () => {
      active = false;
    };
  }, [key, userId]);
  useEffect(() => {
    if (!loadedKey) return;
    const target = loadedKey;
    writes.current = writes.current
      .then(() => AsyncStorage.setItem(target, JSON.stringify(state)))
      .catch(() => setError('Could not save your changes on this device.'));
  }, [state, loadedKey]);
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
        unsave: id =>
          setState(s =>
            s.saved.includes(id)
              ? { ...s, saved: s.saved.filter(x => x !== id) }
              : s,
          ),
        enqueue: ids =>
          setState(s => {
            const fresh = ids.filter(
              (id, i) => !s.saved.includes(id) && ids.indexOf(id) === i,
            );
            if (!fresh.length) return s;
            return {
              ...s,
              library: fresh.reduce(remember, s.library),
              saved: [...s.saved, ...fresh],
            };
          }),
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
