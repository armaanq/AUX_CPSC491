import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import * as Keychain from 'react-native-keychain';
import { musicFromSearch, registerMusic } from '../src/data/prototype';
import { AuthProvider, useAuth } from '../src/state/AuthProvider';
import { RankingsProvider, useRankings } from '../src/state/RankingsProvider';
import { fakeServer, fakeSong, type FakeSong } from '../testing/fakeServer';

const SERVICE = 'com.aux.session';
let rankings: ReturnType<typeof useRankings>;
let auth: ReturnType<typeof useAuth>;
function Probe() {
  rankings = useRankings();
  auth = useAuth();
  return null;
}
const appId = (s: FakeSong) => `mb:${s.externalId}`;
const flush = () => act(async () => new Promise(res => setTimeout(res, 0)));

async function launch() {
  let r: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      <AuthProvider>
        <RankingsProvider>
          <Probe />
        </RankingsProvider>
      </AuthProvider>,
    );
  });
  await flush();
  return r!;
}

const one = fakeSong(1, 'Ivy');
const two = fakeSong(2, 'Nights');
const three = fakeSong(3, 'Pink + White');
let server: ReturnType<typeof fakeServer>;

beforeEach(async () => {
  await Keychain.setGenericPassword('armaan', 'tok', { service: SERVICE });
  registerMusic([three].map(s => musicFromSearch({ ...s, songId: null })));
});
function useServer(ranked: Parameters<typeof fakeServer>[1] = []) {
  server = fakeServer([one, two, three], ranked);
  globalThis.fetch = server.fetch as unknown as typeof fetch;
}
const writes = () => server.calls.filter(c => c.method !== 'GET');

test('loads your rankings after login, best first, with the newest in "recent"', async () => {
  useServer([
    [one, 'FINE'],
    [two, 'LOVED'],
  ]);
  const r = await launch();
  expect(rankings.rankings).toEqual([
    { musicId: appId(two), sentiment: 'LOVED', score: 10 },
    { musicId: appId(one), sentiment: 'FINE', score: 6.66 },
  ]);
  expect(rankings.recent).toEqual([appId(two), appId(one)]);
  expect(rankings.loading).toBe(false);
  await act(async () => r.unmount());
});

test('a brand-new account starts with no rankings', async () => {
  useServer();
  const r = await launch();
  expect(rankings.rankings).toEqual([]);
  expect(rankings.recent).toEqual([]);
  await act(async () => r.unmount());
});

test('logging out clears your rankings from the app', async () => {
  useServer([[one, 'LOVED']]);
  const r = await launch();
  expect(rankings.rankings).toHaveLength(1);
  await act(async () => auth.logOut());
  expect(rankings.rankings).toEqual([]);
  await act(async () => r.unmount());
});

test('looks up a song’s AUX id once, and not at all for songs already ranked', async () => {
  useServer([[one, 'LOVED']]);
  const r = await launch();
  await act(async () => rankings.rank(appId(three), 'LOVED', 1));
  await flush();
  await act(async () => rankings.rank(appId(three), 'FINE', 0));
  await act(async () => rankings.rank(appId(one), 'FINE', 0));
  await flush();
  expect(writes().map(c => c.path)).toEqual([
    '/songs/resolve',
    `/me/rankings/${three.id}`,
    `/me/rankings/${three.id}`,
    `/me/rankings/${one.id}`,
  ]);
  expect(rankings.rankings.map(x => [x.musicId, x.sentiment])).toEqual([
    [appId(one), 'FINE'],
    [appId(three), 'FINE'],
  ]);
  await act(async () => r.unmount());
});

test('saves happen in the order you made them, even back to back', async () => {
  useServer([[one, 'LOVED']]);
  const r = await launch();
  await act(async () => {
    rankings.rank(appId(three), 'LOVED', 0);
    rankings.rank(appId(three), 'DISLIKED', 0);
  });
  await flush();
  const saves = writes().filter(c => c.method === 'PUT');
  expect(saves.map(c => c.body.sentiment)).toEqual(['LOVED', 'DISLIKED']);
  expect(
    rankings.rankings.find(x => x.musicId === appId(three))!.sentiment,
  ).toBe('DISLIKED');
  await act(async () => r.unmount());
});

test('built-in sample songs are never sent to the server', async () => {
  useServer();
  const r = await launch();
  await act(async () => rankings.rank('t5', 'LOVED', 0));
  await flush();
  expect(writes()).toEqual([]);
  expect(rankings.rankings).toEqual([]);
  await act(async () => r.unmount());
});
