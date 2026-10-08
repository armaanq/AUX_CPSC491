// A tiny in-memory AUX server for tests: login, song resolve and rankings,
// scored with the same rules as the real server.
import type { RankedSong } from '../src/api/rankings';
import {
  SENTIMENT_ORDER,
  scoreFor,
  type Sentiment,
} from '../src/data/prototype';

export type FakeSong = RankedSong['song'];

export const fakeUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'armaan@example.com',
  username: 'armaan',
  bio: '',
  avatarUrl: null,
  favoriteGenres: [],
  createdAt: '2026-10-06T00:00:00.000Z',
};

export function fakeSong(n: number, title = `Song ${n}`): FakeSong {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    source: 'musicbrainz',
    externalId: `mbid-${n}`,
    title,
    artist: 'Artist',
    album: null,
    releaseYear: null,
    durationMs: null,
    isrc: null,
    artworkUrl: null,
    externalUrl: `https://musicbrainz.org/recording/mbid-${n}`,
    genre: null,
  };
}

type Row = { song: FakeSong; sentiment: Sentiment; rankedAt: string };
export type Call = { method: string; path: string; body?: any; auth?: string };

export function fakeServer(
  songs: FakeSong[],
  ranked: [FakeSong, Sentiment][] = [],
) {
  let clock = 0;
  const stamp = () =>
    new Date(Date.UTC(2026, 9, 1, 0, 0, clock++)).toISOString();
  let rows: Row[] = ranked.map(([song, sentiment]) => ({
    song,
    sentiment,
    rankedAt: stamp(),
  }));
  const calls: Call[] = [];
  let failure: { status: number; message: string } | null = null;
  let held: Promise<void> | null = null;

  const reply = (status: number, body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));
  const list = () => ({
    rankings: SENTIMENT_ORDER.flatMap(sentiment => {
      const band = rows.filter(r => r.sentiment === sentiment);
      return band.map((r, i) => ({
        sentiment,
        position: i,
        score: scoreFor(sentiment, i, band.length),
        rankedAt: r.rankedAt,
        song: r.song,
      }));
    }),
  });

  const fetch = (url: string, init: RequestInit = {}) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const auth = (init.headers as Record<string, string> | undefined)
      ?.Authorization;
    calls.push({ method, path, body, auth });
    if (failure && method !== 'GET') {
      const { status, message } = failure;
      failure = null;
      return reply(status, { message });
    }
    if (path === '/me') return reply(200, fakeUser);
    if (path === '/me/rankings' && method === 'GET')
      return (held ?? Promise.resolve()).then(() => reply(200, list()));
    if (path === '/songs/resolve') {
      const song = songs.find(s => s.externalId === body.externalId);
      return song
        ? reply(200, { id: song.id })
        : reply(404, { message: 'Unknown song' });
    }
    const match = path.match(/^\/me\/rankings\/(.+)$/);
    if (match && method === 'PUT') {
      const song = songs.find(s => s.id === match[1])!;
      const previous = rows.find(r => r.song.id === song.id);
      const others = rows.filter(r => r.song.id !== song.id);
      const band = others.filter(r => r.sentiment === body.sentiment);
      band.splice(Math.min(body.position, band.length), 0, {
        song,
        sentiment: body.sentiment,
        rankedAt: previous?.rankedAt ?? stamp(),
      });
      rows = SENTIMENT_ORDER.flatMap(s =>
        s === body.sentiment ? band : others.filter(r => r.sentiment === s),
      );
      return reply(200, list());
    }
    return reply(404, { message: `Unexpected ${method} ${path}` });
  };

  return {
    fetch,
    calls,
    /** Makes the next write (resolve or save) fail with this status and message. */
    failNextWrite(status: number, message: string) {
      failure = { status, message };
    },
    /** Holds GET /me/rankings until the returned function is called (a slow load). */
    holdRankingsLoad() {
      let release!: () => void;
      held = new Promise(res => (release = res));
      return () => {
        held = null;
        release();
      };
    },
  };
}
