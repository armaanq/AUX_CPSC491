import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { AlbumResult, SearchResult } from '../src/api/songs';
import {
  GlobalRankingsScreen,
  HomeScreen,
  SearchScreen,
} from '../src/screens/DiscoverScreens';
import { AuthProvider } from '../src/state/AuthProvider';
import { PrototypeProvider } from '../src/state/PrototypeProvider';
import { RankingsProvider } from '../src/state/RankingsProvider';
import { clearChartsCache } from '../src/state/useCharts';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, push: mockNavigate }),
}));

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'armaan@example.com',
  username: 'armaan',
  bio: '',
  avatarUrl: null,
  favoriteGenres: [],
  createdAt: '2026-10-06T00:00:00.000Z',
};
function song(id: string, title: string, artist: string): SearchResult {
  return {
    source: 'apple',
    externalId: id,
    title,
    artist,
    album: `${title} - Single`,
    releaseYear: 2026,
    durationMs: 200000,
    isrc: `ISRC${id}`,
    genre: 'Hip-Hop/Rap',
    artworkUrl: `https://is1-ssl.mzstatic.com/${id}/600x600bb.jpg`,
    externalUrl: `https://music.apple.com/us/song/${id}`,
    songId: null,
  };
}
function album(id: string, title: string, artist: string): AlbumResult {
  return {
    source: 'apple',
    externalId: id,
    title,
    artist,
    releaseYear: 2026,
    trackCount: 12,
    genre: 'Hip-Hop/Rap',
    artworkUrl: `https://is1-ssl.mzstatic.com/${id}/600x600bb.jpg`,
    externalUrl: `https://music.apple.com/us/album/${id}`,
  };
}
const eclipse = song('101', 'Solar Eclipse', 'Drake & Don Toliver');
const texas = song('102', 'Choosin’ Texas', 'Ella Langley');
const habibti = album('201', 'HABIBTI (FOMO)', 'Drake');
const janice = song('301', 'Janice STFU', 'Drake');

type Routes = Record<string, () => unknown>;
const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;
/** A pretend server: answers by path (and query), 404 for anything else. */
function serve(routes: Routes) {
  fetchMock.mockImplementation((url: string) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const handler = routes[path];
    if (!handler) {
      return Promise.resolve(
        new Response(JSON.stringify({ message: `No ${path}` }), {
          status: 404,
        }),
      );
    }
    try {
      return Promise.resolve(
        new Response(JSON.stringify(handler()), { status: 200 }),
      );
    } catch (err) {
      return Promise.resolve(
        new Response(JSON.stringify({ message: (err as Error).message }), {
          status: 503,
        }),
      );
    }
  });
}
const calls = (path: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path)).length;

async function show(screen: React.ReactNode) {
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
            <PrototypeProvider>{screen}</PrototypeProvider>
          </RankingsProvider>
        </AuthProvider>
      </SafeAreaProvider>,
    );
  });
  await act(async () => {});
  return r!;
}
const texts = (r: Pick<TestRenderer.ReactTestRenderer, 'root'>) =>
  r.root
    .findAllByType(Text)
    .map(t => [t.props.children].flat().join(''))
    .join('\n');
async function choose(r: TestRenderer.ReactTestRenderer, label: string) {
  const target = r.root
    .findAll(n => typeof n.props.onPress === 'function')
    .find(n => texts({ root: n }) === label);
  if (!target) throw new Error(`No button "${label}"`);
  await act(async () => target.props.onPress());
  await act(async () => {});
}

beforeEach(async () => {
  fetchMock.mockReset();
  mockNavigate.mockReset();
  clearChartsCache();
  await AsyncStorage.clear();
  // Logged in, so the screens can load your rankings too.
  await Keychain.setGenericPassword('armaan', 'tok', {
    service: 'com.aux.session',
  });
});

describe('Home', () => {
  it('shows Apple Music’s top albums and songs, with your score on songs you ranked', async () => {
    serve({
      '/me': () => user,
      '/me/rankings': () => ({
        rankings: [
          {
            sentiment: 'LOVED',
            position: 0,
            score: 10,
            rankedAt: '2026-10-12T00:00:00.000Z',
            song: { ...texas, id: 'aux-texas' },
          },
        ],
      }),
      '/charts': () => ({ songs: [eclipse, texas], albums: [habibti] }),
    });
    const r = await show(<HomeScreen />);
    const t = texts(r);
    expect(t).toContain('Top albums');
    expect(t).toContain('HABIBTI (FOMO)');
    expect(t).toContain('Top songs');
    expect(t).toMatch(/1\nSolar Eclipse/);
    expect(t).toMatch(/2\nChoosin’ Texas\nElla Langley\n10\.00/);
    expect(t).toContain('Charts from Apple Music');
    // The built-in sample albums are gone from Home.
    expect(t).not.toContain('Your next listen');
    expect(t).not.toContain('CURATED PICKS');
  });

  it('says so when the charts can’t load, and the rest of Home still works', async () => {
    serve({
      '/me': () => user,
      '/me/rankings': () => ({ rankings: [] }),
      '/charts': () => {
        throw new Error('Charts are unavailable right now.');
      },
    });
    const r = await show(<HomeScreen />);
    expect(texts(r)).toContain('Charts are unavailable right now.');
    expect(texts(r)).toContain('In your circle');
  });
});

describe('Discover', () => {
  it('shows the chart before you search, and each genre’s chart when you pick it', async () => {
    serve({
      '/me': () => user,
      '/me/rankings': () => ({ rankings: [] }),
      '/charts': () => ({ songs: [eclipse], albums: [habibti] }),
      '/charts?genre=18': () => ({ songs: [janice], albums: [] }),
    });
    const r = await show(<SearchScreen />);
    expect(texts(r)).toContain('Solar Eclipse');
    expect(texts(r)).toContain('HABIBTI (FOMO)');
    expect(texts(r)).not.toContain('Explore the collection');

    await choose(r, 'Hip-Hop');
    expect(calls('/charts?genre=18')).toBe(1);
    expect(texts(r)).toContain('Janice STFU');
    expect(texts(r)).not.toContain('Solar Eclipse');

    // Going back to all genres reuses the chart it already loaded.
    await choose(r, 'All genres');
    expect(texts(r)).toContain('Solar Eclipse');
    expect(calls('/charts')).toBe(1);
  });

  it('applies the Songs and Albums filters to the chart', async () => {
    serve({
      '/me': () => user,
      '/me/rankings': () => ({ rankings: [] }),
      '/charts': () => ({ songs: [eclipse], albums: [habibti] }),
    });
    const r = await show(<SearchScreen />);
    await choose(r, 'Songs');
    expect(texts(r)).toContain('Solar Eclipse');
    expect(texts(r)).not.toContain('HABIBTI (FOMO)');
    await choose(r, 'Albums');
    expect(texts(r)).toContain('HABIBTI (FOMO)');
    expect(texts(r)).not.toContain('Solar Eclipse');
  });
});

describe('Charts tab', () => {
  it('shows the AUX chart: average scores and how many people ranked each song', async () => {
    serve({
      '/me': () => user,
      '/me/rankings': () => ({ rankings: [] }),
      '/charts/community': () => ({
        entries: [
          { song: { ...eclipse, id: 'a' }, listeners: 3, averageScore: 9.44 },
          { song: { ...texas, id: 'b' }, listeners: 1, averageScore: 8.34 },
        ],
      }),
    });
    const r = await show(<GlobalRankingsScreen />);
    const t = texts(r);
    expect(t).toMatch(/1\nSolar Eclipse\nDrake & Don Toliver · 3 listeners\n9\.44/);
    expect(t).toMatch(/2\nChoosin’ Texas\nElla Langley · 1 listener\n8\.34/);
    expect(t).not.toContain('SAMPLE CHART');
  });

  it('invites the first ranking when the chart is empty', async () => {
    serve({
      '/me': () => user,
      '/me/rankings': () => ({ rankings: [] }),
      '/charts/community': () => ({ entries: [] }),
    });
    const r = await show(<GlobalRankingsScreen />);
    expect(texts(r)).toContain('An open spot at the top');
  });
});
