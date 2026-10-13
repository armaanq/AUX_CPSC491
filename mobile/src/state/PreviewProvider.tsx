import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet } from 'react-native';
import Video from 'react-native-video';
import { getPreviewUrl } from '../api/songs';
import type { Music } from '../data/prototype';

/**
 * One 30-second Apple Music preview at a time, app-wide. Starting a preview
 * stops whatever was playing, so the two songs on the compare screen never
 * talk over each other.
 *
 * The audio streams straight from Apple's servers; nothing is downloaded or
 * kept on the phone (Apple's preview terms allow streaming only).
 */
export type PreviewStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'unavailable'
  | 'error';

type Current = {
  musicId: string;
  uri: string | null;
  status: PreviewStatus;
  /** Which request started it; a retry gets a fresh player. */
  ticket: number;
};

type PreviewContextValue = {
  /** The song the player is on (playing, paused or loading), if any. */
  current: Current | null;
  /** 0–1 through the clip. */
  progress: number;
  /** Play, pause or resume this song's preview. */
  toggle: (item: Music) => void;
  stop: () => void;
  /** What the player knows about this song: idle unless it's the current one or has no clip. */
  statusOf: (musicId: string) => PreviewStatus;
};

/** Outside a PreviewProvider (some tests) there's simply nothing to play. */
const silent: PreviewContextValue = {
  current: null,
  progress: 0,
  toggle: () => {},
  stop: () => {},
  statusOf: () => 'idle',
};
const PreviewContext = createContext<PreviewContextValue>(silent);

/** Apple's clips are 30 seconds; used until the player reports the real length. */
const CLIP_SECONDS = 30;

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [current, setCurrentState] = useState<Current | null>(null);
  /** Mirrors `current` so toggle can decide synchronously (two quick taps, one render). */
  const latest = useRef<Current | null>(null);
  const setCurrent = useCallback((next: Current | null) => {
    latest.current = next;
    setCurrentState(next);
  }, []);
  const [progress, setProgress] = useState(0);
  const duration = useRef(CLIP_SECONDS);
  /** musicId -> clip url (null: Apple has none). Only urls; the audio itself isn't cached. */
  const urls = useRef(new Map<string, string | null>());
  /** Bumped on every new request so a slow lookup can't start a song the user moved past. */
  const request = useRef(0);

  const stop = useCallback(() => {
    request.current += 1;
    setCurrent(null);
    setProgress(0);
  }, [setCurrent]);

  const toggle = useCallback((item: Music) => {
    const prev = latest.current;
    if (prev?.musicId === item.id) {
      if (prev.status === 'loading') return;
      if (prev.status === 'playing' || prev.status === 'paused') {
        setCurrent({
          ...prev,
          status: prev.status === 'playing' ? 'paused' : 'playing',
        });
        return;
      }
    }

    const ticket = ++request.current;
    setProgress(0);
    duration.current = CLIP_SECONDS;
    const start = (uri: string | null) => {
      if (ticket !== request.current) return;
      setCurrent({
        musicId: item.id,
        uri,
        status: uri ? 'playing' : 'unavailable',
        ticket,
      });
    };
    const known = urls.current.get(item.id);
    if (known !== undefined) {
      start(known);
      return;
    }
    setCurrent({ musicId: item.id, uri: null, status: 'loading', ticket });
    getPreviewUrl(item)
      .then(uri => {
        urls.current.set(item.id, uri);
        start(uri);
      })
      .catch(() => {
        if (ticket !== request.current) return;
        setCurrent({ musicId: item.id, uri: null, status: 'error', ticket });
      });
  }, [setCurrent]);

  const statusOf = useCallback(
    (musicId: string): PreviewStatus => {
      if (current?.musicId === musicId) return current.status;
      return urls.current.get(musicId) === null ? 'unavailable' : 'idle';
    },
    [current],
  );

  const value = useMemo(
    () => ({ current, progress, toggle, stop, statusOf }),
    [current, progress, toggle, stop, statusOf],
  );

  return (
    <PreviewContext.Provider value={value}>
      {children}
      {current?.uri && (
        <Video
          // A new key per play (song or retry) gives a fresh player rather than a seek.
          key={current.ticket}
          testID="preview-player"
          source={{ uri: current.uri }}
          paused={current.status !== 'playing'}
          // Previews are something you tap to hear, so play even with the ringer switch on silent.
          ignoreSilentSwitch="ignore"
          playInBackground={false}
          progressUpdateInterval={250}
          onLoad={({ duration: d }) => {
            if (d > 0) duration.current = d;
          }}
          onProgress={({ currentTime }) =>
            setProgress(Math.min(1, currentTime / duration.current))
          }
          onEnd={stop}
          onError={() => {
            const prev = latest.current;
            if (prev) setCurrent({ ...prev, status: 'error' });
          }}
          style={styles.hidden}
        />
      )}
    </PreviewContext.Provider>
  );
}

export function usePreview(): PreviewContextValue {
  return useContext(PreviewContext);
}

const styles = StyleSheet.create({
  hidden: { width: 0, height: 0, position: 'absolute' },
});
