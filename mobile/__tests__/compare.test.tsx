import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { musicFromSearch, registerMusic } from '../src/data/prototype';
import { CompareScreen } from '../src/screens/CompareScreen';
import { AuthProvider } from '../src/state/AuthProvider';
import {
  PrototypeProvider,
  usePrototype,
} from '../src/state/PrototypeProvider';
import { RankingsProvider, useRankings } from '../src/state/RankingsProvider';
import { fakeServer, fakeSong, type FakeSong } from '../testing/fakeServer';

const SERVICE = 'com.aux.session';
let rankings: ReturnType<typeof useRankings>;
let prototype: ReturnType<typeof usePrototype>;
function Probe() {
  rankings = useRankings();
  prototype = usePrototype();
  return null;
}
const nav = { goBack: jest.fn(), navigate: jest.fn() } as any;
const appId = (s: FakeSong) => `mb:${s.externalId}`;

async function open(musicId: string) {
  let r: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <AuthProvider>
          <RankingsProvider>
            <PrototypeProvider>
              <Probe />
              <CompareScreen
                route={{ key: 'c', name: 'Compare', params: { musicId } }}
                navigation={nav}
              />
            </PrototypeProvider>
          </RankingsProvider>
        </AuthProvider>
      </SafeAreaProvider>,
    );
  });
  await act(async () => {});
  return r!;
}
const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(Text)
    .map(t => [t.props.children].flat().join(''))
    .join('\n');
const press = async (r: TestRenderer.ReactTestRenderer, label: string) => {
  const target = r.root
    .findAll(n => typeof n.props.onPress === 'function')
    .find(n => texts({ root: n } as any).includes(label));
  if (!target) throw new Error(`No button "${label}"`);
  await act(async () => target.props.onPress());
};
const flush = () => act(async () => new Promise(res => setTimeout(res, 0)));

// Two songs already ranked "It was fine"; a third, new song gets compared against them.
const a = fakeSong(1, 'Ivy');
const b = fakeSong(2, 'Nights');
const c = fakeSong(3, 'Self Control');
let server: ReturnType<typeof fakeServer>;

beforeEach(async () => {
  await AsyncStorage.clear();
  await Keychain.setGenericPassword('armaan', 'tok', { service: SERVICE });
  server = fakeServer(
    [a, b, c],
    [
      [a, 'FINE'],
      [b, 'FINE'],
    ],
  );
  globalThis.fetch = server.fetch as unknown as typeof fetch;
  registerMusic([c].map(s => musicFromSearch({ ...s, songId: null })));
});

test('compares against your saved rankings and saves the result to the server', async () => {
  const r = await open(appId(c));
  expect(rankings.rankings.map(x => x.musicId)).toEqual([appId(a), appId(b)]);
  expect(texts(r)).toContain('First, how did');
  await press(r, 'It was fine');
  // Prefer the existing song every time, so the new one lands at the bottom.
  while (texts(r).includes('Which stays')) await press(r, 'FROM YOUR LIST');
  expect(texts(r)).toContain('Found its place.');
  await press(r, 'Save to my rankings');
  await flush();

  const writes = server.calls.filter(x => x.method !== 'GET');
  expect(writes.map(x => x.path)).toEqual([
    '/songs/resolve',
    `/me/rankings/${c.id}`,
  ]);
  expect(writes[0].body).toEqual({
    source: 'musicbrainz',
    externalId: 'mbid-3',
  });
  expect(writes[1].body).toEqual({ sentiment: 'FINE', position: 2 });
  expect(writes.every(x => x.auth === 'Bearer tok')).toBe(true);

  expect(rankings.rankings).toEqual([
    { musicId: appId(a), sentiment: 'FINE', score: 6.66 },
    { musicId: appId(b), sentiment: 'FINE', score: 5.55 },
    { musicId: appId(c), sentiment: 'FINE', score: 4.45 },
  ]);
  expect(rankings.recent[0]).toBe(appId(c));
  expect(texts(r)).toContain('That’s your take.');
  expect(texts(r)).toContain('4.45');
  await act(async () => r.unmount());
});

test('waits for your rankings to load before comparing, so the spot is right', async () => {
  const release = server.holdRankingsLoad();
  const r = await open(appId(c));
  expect(texts(r)).toContain('Loading your rankings…');
  expect(texts(r)).not.toContain('It was fine');
  await act(async () => release());
  await flush();
  await press(r, 'It was fine');
  // Compared against the two songs that just loaded, not an empty list.
  expect(texts(r)).toContain('Which stays');
  expect(texts(r)).not.toContain('First of its kind');
  await act(async () => r.unmount());
});

test('ranking a song takes it off the listening queue', async () => {
  const r = await open(appId(c));
  await act(async () => prototype.toggleSaved(appId(c)));
  expect(prototype.state.saved).toContain(appId(c));
  await press(r, 'Loved it');
  await press(r, 'Save to my rankings');
  await flush();
  expect(prototype.state.saved).not.toContain(appId(c));
  await act(async () => r.unmount());
});

test('a failed save puts your rankings back and says why', async () => {
  server.failNextWrite(503, 'Database unavailable');
  const r = await open(appId(c));
  await press(r, 'Loved it');
  await press(r, 'Save to my rankings');
  await flush();
  expect(rankings.rankings.map(x => x.musicId)).toEqual([appId(a), appId(b)]);
  expect(rankings.error).toBe(
    "Couldn't save your ranking. Database unavailable",
  );
  expect(texts(r)).toContain('Database unavailable');
  await act(async () => r.unmount());
});

test('sample songs explain how to rank the real track', async () => {
  const r = await open('t5');
  expect(texts(r)).toContain('This is a sample song');
  expect(texts(r)).not.toContain('First, how did');
  await act(async () => r.unmount());
});

test('albums show a message instead of the ranking flow', async () => {
  const r = await open('a0');
  expect(texts(r)).toContain('Only songs can be ranked');
  await act(async () => r.unmount());
});
