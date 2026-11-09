import React from 'react';
import { Alert, Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import App from '../App';
import type { SearchResult } from '../src/api/songs';
import type { PublicUser } from '../src/api/users';
import { clearChartsCache } from '../src/state/useCharts';

// The real provider waits for device screen measurements, which Jest doesn't have.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

const SERVICE = 'com.aux.session';
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const me = {
  id: ID(1),
  email: 'armaan@example.com',
  username: 'armaan',
  bio: '',
  avatarUrl: null,
  favoriteGenres: [],
  onboardedAt: '2026-10-06T00:00:00.000Z' as string | null,
  createdAt: '2026-10-06T00:00:00.000Z',
};
const person = (n: number, username: string, extra: Partial<PublicUser> = {}): PublicUser => ({
  id: ID(n),
  username,
  bio: '',
  avatarUrl: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  rankedCount: 12,
  status: 'none',
  taste: { score: null, shared: 0 },
  ...extra,
});
const janice: SearchResult = {
  source: 'apple',
  externalId: '301',
  title: 'Janice STFU',
  artist: 'Drake',
  album: 'Janice STFU - Single',
  releaseYear: 2026,
  durationMs: 200000,
  isrc: 'ISRC301',
  genre: 'Hip-Hop/Rap',
  artworkUrl: null,
  externalUrl: 'https://music.apple.com/us/song/301',
  songId: null,
};

type Handler = (body: any) => unknown;
let routes: Record<string, Handler> = {};
const fetchMock = jest.fn((url: string, init: RequestInit = {}) => {
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  const method = init.method ?? 'GET';
  const handler = routes[`${method} ${path}`];
  const body = init.body ? JSON.parse(String(init.body)) : undefined;
  if (!handler)
    return Promise.resolve(
      new Response(JSON.stringify({ message: `No ${method} ${path}` }), { status: 404 }),
    );
  return Promise.resolve(new Response(JSON.stringify(handler(body)), { status: 200 }));
});
globalThis.fetch = fetchMock as unknown as typeof fetch;
const called = (method: string, path: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => String(url).endsWith(path) && ((init as RequestInit)?.method ?? 'GET') === method,
  ).length;

type Renderer = TestRenderer.ReactTestRenderer;
const texts = (r: Pick<Renderer, 'root'>) =>
  r.root
    .findAllByType(Text)
    .map(t => [t.props.children].flat().join(''))
    .join('\n');
const settle = () => act(async () => new Promise(res => setTimeout(res, 0)));
const mounted: Renderer[] = [];
async function launch() {
  let r: Renderer;
  await act(async () => {
    r = TestRenderer.create(<App />);
  });
  mounted.push(r!);
  await settle();
  await settle();
  return r!;
}
/** Presses the last button whose label or text matches (newest screen wins). */
async function press(r: Renderer, label: string) {
  const target = r.root
    .findAll(n => typeof n.props.onPress === 'function')
    .filter(n => n.props.accessibilityLabel === label || texts({ root: n }) === label)
    .at(-1);
  if (!target) throw new Error(`No button "${label}"`);
  await act(async () => target.props.onPress());
  await settle();
}

beforeEach(async () => {
  fetchMock.mockClear();
  clearChartsCache();
  await AsyncStorage.clear();
  await Keychain.setGenericPassword('armaan', 'tok', { service: SERVICE });
  routes = {
    'GET /me': () => me,
    'GET /me/rankings': () => ({ rankings: [] }),
    'GET /friends': () => ({ friends: [], incoming: [], outgoing: [] }),
    'GET /charts': () => ({ songs: [janice], albums: [] }),
    'GET /users': () => ({ users: [] }),
  };
});

// Let the friends drawer finish its 220 ms slide, then unmount, so no
// animation updates the app after Jest has torn the test down.
afterEach(async () => {
  await act(async () => new Promise(res => setTimeout(res, 300)));
  await act(async () => mounted.splice(0).forEach(r => r.unmount()));
});

describe('first-run setup', () => {
  it('sends a new account to import a playlist before anything else', async () => {
    routes['GET /me'] = () => ({ ...me, onboardedAt: null });
    routes['POST /me/onboarded'] = () => ({ ...me, onboardedAt: '2026-10-16T00:00:00.000Z' });
    const r = await launch();
    expect(texts(r)).toContain('Start with a\nplaylist you love.');
    expect(texts(r)).not.toContain('Hot 100');

    // No playlist: pick songs from the charts instead.
    await press(r, 'I don’t have a playlist');
    expect(texts(r)).toContain('Pick songs\nyou know.');
    await press(r, 'Janice STFU by Drake');
    await press(r, 'Add 1 to my queue');

    expect(called('POST', '/me/onboarded')).toBe(1);
    // Setup done: the app opens on the queue it just filled.
    const t = texts(r);
    expect(t).toContain('1 TO RANK');
    expect(t).toContain('Janice STFU');
  });

  it('never shows setup to an account that already finished it', async () => {
    const r = await launch();
    expect(texts(r)).not.toContain('playlist you love');
    expect(texts(r)).toContain('Discover');
  });
});

describe('friends', () => {
  it('accepts a request, finds people by username, and sends a request', async () => {
    const shyan = person(2, 'shyan', { status: 'incoming' });
    const arian = person(3, 'arian', { taste: { score: 85, shared: 10 } });
    routes['GET /friends'] = () => ({ friends: [], incoming: [shyan], outgoing: [] });
    routes[`POST /friends/${shyan.id}`] = () => ({ status: 'friends' });
    routes['GET /users?q=ari'] = () => ({ users: [arian] });
    routes[`POST /friends/${arian.id}`] = () => ({ status: 'outgoing' });
    const r = await launch();

    await press(r, 'Friends, 1 new request');
    expect(texts(r)).toContain('1 REQUEST');
    await press(r, 'Accept @shyan');
    expect(called('POST', `/friends/${shyan.id}`)).toBe(1);
    expect(texts(r)).toContain('FRIENDS · 1');
    expect(texts(r)).not.toContain('Wants to be friends');

    const search = r.root.find(
      n => n.type === TextInput && n.props.accessibilityLabel === 'Find people by username',
    );
    await act(async () => search.props.onChangeText('ari'));
    await act(async () => new Promise(res => setTimeout(res, 350)));
    await settle();
    expect(texts(r)).toContain('85% taste match');
    await press(r, 'Add @arian');
    expect(called('POST', `/friends/${arian.id}`)).toBe(1);
    expect(texts(r)).toContain('SENT');
    expect(texts(r)).toContain('Requested');
  });

  it('reports a listener, then blocks them and leaves their profile', async () => {
    const arian = person(3, 'arian');
    routes['GET /users'] = () => ({ users: [arian] });
    routes[`GET /users/${arian.id}`] = () => ({ user: arian, rankings: [] });
    let report: unknown;
    routes[`POST /users/${arian.id}/report`] = body => {
      report = body;
      return { reported: true };
    };
    routes[`PUT /me/blocks/${arian.id}`] = () => ({ blocked: true });
    // Answer each dialog by tapping the named button.
    const answers: string[] = [];
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const answer = answers.shift();
      buttons?.find(b => b.text === answer)?.onPress?.();
    });
    const r = await launch();
    await press(r, 'Friends');
    await press(r, 'Open @arian');
    expect(texts(r)).toContain('Their rankings');

    answers.push('Harassment or bullying', 'Block', 'Block');
    await press(r, 'Report @arian');
    await settle();
    expect(report).toEqual({ reason: 'HARASSMENT' });
    expect(alert.mock.calls.map(c => c[0])).toEqual([
      'Report @arian?',
      'Thanks for telling us',
      'Block @arian?',
    ]);
    expect(called('PUT', `/me/blocks/${arian.id}`)).toBe(1);
    // Friends reload (the friendship is gone), and you're taken off their profile.
    expect(called('GET', '/friends')).toBeGreaterThan(1);
    expect(texts(r)).not.toContain('Their rankings');
    alert.mockRestore();
  });

  it('opens a listener’s profile with your taste match and their rankings', async () => {
    const arian = person(3, 'arian', {
      bio: 'Deep cuts only.',
      rankedCount: 1,
      taste: { score: 85, shared: 4 },
    });
    routes['GET /users'] = () => ({ users: [arian] });
    routes[`GET /users/${arian.id}`] = () => ({
      user: arian,
      rankings: [
        {
          sentiment: 'LOVED',
          position: 0,
          score: 9.5,
          rankedAt: '2026-10-10T00:00:00.000Z',
          song: { ...janice, id: ID(30) },
        },
      ],
    });
    const r = await launch();
    await press(r, 'Friends');
    await press(r, 'Open @arian');
    const t = texts(r);
    expect(t).toContain('@arian');
    expect(t).toContain('Deep cuts only.');
    expect(t).toContain('85% in tune');
    expect(t).toContain('Their rankings');
    expect(t).toContain('Janice STFU');
    expect(t).toContain('Add friend');
  });
});
