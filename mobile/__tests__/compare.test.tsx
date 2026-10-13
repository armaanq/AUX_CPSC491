import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ScoreSlider } from '../src/components/ScoreSlider';
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
const nav = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  setParams: jest.fn(),
} as any;
const appId = (s: FakeSong) => `mb:${s.externalId}`;

const screen = (musicId: string) => (
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
  </SafeAreaProvider>
);

async function open(musicId: string) {
  let r: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(screen(musicId));
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
const slide = (r: TestRenderer.ReactTestRenderer, score: number) =>
  act(async () => r.root.findByType(ScoreSlider).props.onChange(score));
const sliderText = (r: TestRenderer.ReactTestRenderer) =>
  texts({ root: r.root.findByType(ScoreSlider) } as any);
/** The song from your list you're being asked to pick against. */
const opponent = (r: TestRenderer.ReactTestRenderer) =>
  texts({
    root: r.root
      .findAll(n => typeof n.props.onPress === 'function')
      .find(n => texts({ root: n } as any).includes('FROM YOUR LIST')),
  } as any);

// Two songs already ranked "It was fine"; a third, new song gets compared against them.
const a = fakeSong(1, 'Ivy');
const b = fakeSong(2, 'Nights');
const c = fakeSong(3, 'Self Control');
let server: ReturnType<typeof fakeServer>;

beforeEach(async () => {
  jest.clearAllMocks();
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
  await slide(r, 5);
  await press(r, 'Continue');
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
  expect(r.root.findAllByType(ScoreSlider)).toHaveLength(0);
  await act(async () => release());
  await flush();
  await slide(r, 5);
  await press(r, 'Continue');
  // Compared against the two songs that just loaded, not an empty list.
  expect(texts(r)).toContain('Which stays');
  expect(texts(r)).not.toContain('First of its kind');
  await act(async () => r.unmount());
});

test('ranking a song takes it off the listening queue', async () => {
  const r = await open(appId(c));
  await act(async () => prototype.toggleSaved(appId(c)));
  expect(prototype.state.saved).toContain(appId(c));
  await slide(r, 9);
  await press(r, 'Continue');
  await press(r, 'Save to my rankings');
  await flush();
  expect(prototype.state.saved).not.toContain(appId(c));
  // Nothing else is queued, so there's no next song to jump to.
  expect(texts(r)).not.toContain('Rank the next one');
  expect(texts(r)).toContain('Find more to rank');
  await act(async () => r.unmount());
});

test('a failed save puts your rankings back and says why', async () => {
  server.failNextWrite(503, 'Database unavailable');
  const r = await open(appId(c));
  await slide(r, 9);
  await press(r, 'Continue');
  await press(r, 'Save to my rankings');
  await flush();
  expect(rankings.rankings.map(x => x.musicId)).toEqual([appId(a), appId(b)]);
  expect(rankings.error).toBe(
    "Couldn't save your ranking. Database unavailable",
  );
  expect(texts(r)).toContain('Database unavailable');
  await act(async () => r.unmount());
});

test('the slider names the reaction its score falls in', async () => {
  const r = await open(appId(c));
  expect(sliderText(r)).toContain('It was fine');
  expect(sliderText(r)).toContain('5.0');
  for (const [score, label] of [
    [0, 'Didn’t like it'],
    [3.3, 'Didn’t like it'],
    [3.4, 'It was fine'],
    [6.6, 'It was fine'],
    [6.7, 'Loved it'],
    [10, 'Loved it'],
  ] as const) {
    await slide(r, score);
    expect(sliderText(r)).toContain(label);
    expect(sliderText(r)).toContain(score.toFixed(1));
  }
  // VoiceOver users swipe up and down to move it.
  const track = r.root.findAll(
    n => n.props.accessibilityRole === 'adjustable',
  )[0];
  await act(async () =>
    track.props.onAccessibilityAction({
      nativeEvent: { actionName: 'decrement' },
    }),
  );
  expect(sliderText(r)).toContain('9.5');
  await act(async () => r.unmount());
});

test('compares against the song you scored closest to, then widens the search', async () => {
  const [d1, d2, d3, d4] = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((t, i) =>
    fakeSong(10 + i, t),
  );
  const fresh = fakeSong(20, 'Echo');
  server = fakeServer(
    [d1, d2, d3, d4, fresh],
    [d1, d2, d3, d4].map(s => [s, 'LOVED'] as [FakeSong, 'LOVED']),
  );
  globalThis.fetch = server.fetch as unknown as typeof fetch;
  registerMusic([musicFromSearch({ ...fresh, songId: null })]);
  const r = await open(appId(fresh));
  // Loved scores are 10, 9.17, 8.34 and 7.5; 7.0 is closest to Delta's.
  await slide(r, 7);
  await press(r, 'Continue');
  const asked: string[] = [];
  const pick = async (newWins: boolean) => {
    asked.push(opponent(r).match(/Alpha|Bravo|Charlie|Delta/)![0]);
    await press(r, newWins ? 'YOUR NEW PICK' : 'FROM YOUR LIST');
  };
  await pick(true); // beats Delta: look one higher
  await pick(true); // beats Charlie: jump two higher
  await pick(false); // loses to Alpha: now it's between Alpha and Charlie
  await pick(true); // beats Bravo
  expect(asked).toEqual(['Delta', 'Charlie', 'Alpha', 'Bravo']);
  expect(texts(r)).toContain('Found its place.');
  await press(r, 'Save to my rankings');
  await flush();
  const save = server.calls.find(x => x.method === 'PUT')!;
  expect(save.body).toEqual({ sentiment: 'LOVED', position: 1 });
  await act(async () => r.unmount());
});

/** Your "Loved it" songs, best first: house and rap tracks mixed together. */
function mixedGenres() {
  const song = (n: number, title: string, genre: string) => ({
    ...fakeSong(n, title),
    genre,
  });
  const loved = [
    song(30, 'Desire', 'Dance'), // 10
    song(31, 'Headlines', 'Hip-Hop/Rap'), // 9.33
    song(32, 'Get Lucky', 'House'), // 8.67
    song(33, 'Marvins Room', 'Rap'), // 8.0
    song(34, 'Midnight', 'Electronic'), // 7.34
  ];
  return loved;
}
const lovedTitles = /Desire|Headlines|Get Lucky|Marvins Room|Midnight/;

test('only asks about songs in the same genre, then your score places it among the rest', async () => {
  const loved = mixedGenres();
  const fresh = {
    ...fakeSong(40, 'Started From the Bottom'),
    genre: 'Hip-Hop/Rap',
  };
  server = fakeServer(
    [...loved, fresh],
    loved.map(s => [s, 'LOVED'] as [FakeSong, 'LOVED']),
  );
  globalThis.fetch = server.fetch as unknown as typeof fetch;
  registerMusic([musicFromSearch({ ...fresh, songId: null })]);
  const r = await open(appId(fresh));
  await slide(r, 8.5);
  expect(texts(r)).toContain('against other Hip-Hop/Rap songs');
  await press(r, 'Continue');
  const asked: string[] = [];
  while (texts(r).includes('Which stays')) {
    expect(texts(r)).toContain('Hip-Hop/Rap');
    asked.push(opponent(r).match(lovedTitles)![0]);
    // It beats Marvins Room but not Headlines.
    await press(r, asked.length === 1 ? 'YOUR NEW PICK' : 'FROM YOUR LIST');
  }
  // "Rap" counts as Hip-Hop/Rap; the house and dance tracks never come up.
  expect(asked).toEqual(['Marvins Room', 'Headlines']);
  expect(texts(r)).toContain('Your picks against your other Hip-Hop/Rap songs');
  await press(r, 'Save to my rankings');
  await flush();
  // Between Headlines and Marvins Room; 8.5 puts it below Get Lucky (8.67).
  const save = server.calls.find(x => x.method === 'PUT')!;
  expect(save.body).toEqual({ sentiment: 'LOVED', position: 3 });
  await act(async () => r.unmount());
});

test('with no songs of its genre in that range, your score alone places it', async () => {
  const loved = mixedGenres();
  const fresh = { ...fakeSong(41, 'Tennessee Whiskey'), genre: 'Country' };
  server = fakeServer(
    [...loved, fresh],
    loved.map(s => [s, 'LOVED'] as [FakeSong, 'LOVED']),
  );
  globalThis.fetch = server.fetch as unknown as typeof fetch;
  registerMusic([musicFromSearch({ ...fresh, songId: null })]);
  const r = await open(appId(fresh));
  await slide(r, 9);
  await press(r, 'Continue');
  expect(texts(r)).not.toContain('Which stays');
  expect(texts(r)).toContain(
    'None of your “loved it” songs are Country yet, so your 9.0 placed it.',
  );
  await press(r, 'Save to my rankings');
  await flush();
  // Below Desire (10) and Headlines (9.33).
  const save = server.calls.find(x => x.method === 'PUT')!;
  expect(save.body).toEqual({ sentiment: 'LOVED', position: 2 });
  await act(async () => r.unmount());
});

test('"Rank the next one" goes straight to the next song in your queue', async () => {
  const d = fakeSong(4, 'Nikes');
  server = fakeServer(
    [a, b, c, d],
    [
      [a, 'FINE'],
      [b, 'FINE'],
    ],
  );
  globalThis.fetch = server.fetch as unknown as typeof fetch;
  registerMusic([musicFromSearch({ ...d, songId: null })]);
  const r = await open(appId(c));
  await act(async () => {
    prototype.toggleSaved(appId(c));
    prototype.toggleSaved(appId(d));
  });
  await slide(r, 9);
  await press(r, 'Continue');
  await press(r, 'Save to my rankings');
  await flush();
  expect(texts(r)).toContain('Up next: Nikes');
  await press(r, 'Rank the next one');
  expect(nav.setParams).toHaveBeenCalledWith({ musicId: appId(d) });
  expect(nav.navigate).not.toHaveBeenCalled();
  // The screen then shows the next song, back at the slider.
  await act(async () => r.update(screen(appId(d))));
  expect(texts(r)).toContain('First, how did');
  expect(texts(r)).toContain('Nikes');
  expect(sliderText(r)).toContain('5.0');
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
