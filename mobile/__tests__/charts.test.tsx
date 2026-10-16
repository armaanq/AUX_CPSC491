import React from 'react';
import { Alert, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { AlbumResult, SearchResult } from '../src/api/songs';
import { TextInput } from 'react-native';
import { AddScreen } from '../src/screens/AddScreen';
import { DiscoverScreen } from '../src/screens/DiscoverScreen';
import { Hot100Screen } from '../src/screens/Hot100Screen';
import { LibraryScreen } from '../src/screens/LibraryScreen';
import { ProfileScreen } from '../src/screens/ProfileScreen';
import { RankScreen, topGenres } from '../src/screens/RankScreen';
import { musicFromSearch, registerMusic } from '../src/data/prototype';
import { clearSongStatsCache } from '../src/state/useSongStats';
import { AuthProvider } from '../src/state/AuthProvider';
import { PrototypeProvider } from '../src/state/PrototypeProvider';
import { RankingsProvider } from '../src/state/RankingsProvider';
import { clearChartsCache } from '../src/state/useCharts';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, push: mockNavigate }),
  useRoute: () => ({ params: undefined }),
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
  clearSongStatsCache();
  await AsyncStorage.clear();
  // Logged in, so the screens can load your rankings too.
  await Keychain.setGenericPassword('armaan', 'tok', {
    service: 'com.aux.session',
  });
});

const ranked = (
  r: SearchResult,
  id: string,
  sentiment: 'LOVED' | 'FINE' | 'DISLIKED',
  position: number,
  score: number,
) => ({
  sentiment,
  position,
  score,
  rankedAt: `2026-10-1${position}T00:00:00.000Z`,
  song: { ...r, id },
});
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('Hot 100', () => {
  it('shows the top 100 with AUX averages, listener counts and your own score', async () => {
    serve({
      '/me': () => user,
      '/me/rankings': () => ({ rankings: [ranked(texas, ID(2), 'LOVED', 0, 10)] }),
      '/charts/community?limit=100': () => ({
        entries: [
          { song: { ...eclipse, id: ID(1) }, listeners: 3, averageScore: 9.44, chartScore: 8.12 },
          { song: { ...texas, id: ID(2) }, listeners: 1, averageScore: 8.34, chartScore: 7.11 },
        ],
      }),
    });
    const r = await show(<Hot100Screen />);
    const t = texts(r);
    expect(t).toMatch(/1\nSolar Eclipse\nDrake & Don Toliver · 3 listeners\nAUX\n9\.44/);
    expect(t).toMatch(/2\nChoosin’ Texas\nElla Langley · 1 listener\nYOU\n10\.00\nAUX\n8\.34/);
  });

  it('switches to one genre’s chart', async () => {
    serve({
      '/me': () => user,
      '/me/rankings': () => ({ rankings: [] }),
      '/charts/community?limit=100': () => ({
        entries: [{ song: { ...eclipse, id: ID(1) }, listeners: 3, averageScore: 9.44, chartScore: 8.12 }],
      }),
      '/charts/community?genre=hip-hop&limit=100': () => ({
        entries: [{ song: { ...janice, id: ID(3) }, listeners: 2, averageScore: 8.1, chartScore: 7.32 }],
      }),
    });
    const r = await show(<Hot100Screen />);
    await choose(r, 'Hip-Hop');
    expect(texts(r)).toContain('Janice STFU');
    expect(texts(r)).not.toContain('Solar Eclipse');
  });

  it('invites the first ranking when a chart is empty', async () => {
    serve({
      '/me': () => user,
      '/me/rankings': () => ({ rankings: [] }),
      '/charts/community?limit=100': () => ({ entries: [] }),
    });
    const r = await show(<Hot100Screen />);
    expect(texts(r)).toContain('An open spot at the top');
  });
});

describe('Discover', () => {
  it('lists your hottest takes: the biggest gaps between you and AUX', async () => {
    serve({
      '/me': () => user,
      '/me/rankings': () => ({
        rankings: [
          ranked(eclipse, ID(1), 'LOVED', 0, 10),
          ranked(texas, ID(2), 'LOVED', 1, 6.67),
        ],
      }),
      '/charts': () => ({ songs: [janice], albums: [habibti] }),
      [`/charts/community/songs?ids=${ID(1)},${ID(2)}`]: () => ({
        stats: [
          { songId: ID(1), listeners: 4, averageScore: 9.6 },
          { songId: ID(2), listeners: 3, averageScore: 9.1 },
        ],
      }),
    });
    const r = await show(<DiscoverScreen />);
    await act(async () => {});
    const t = texts(r);
    // Texas is 2.43 below AUX, Eclipse only 0.40 above: Texas comes first.
    expect(t).toMatch(/Choosin’ Texas\n−2\.43 below AUX · Ella Langley/);
    expect(t.indexOf('Choosin’ Texas')).toBeLessThan(t.indexOf('Solar Eclipse'));
    expect(t).toContain('Trending on Apple Music');
    expect(t).toContain('Janice STFU');
  });

  it('shows your top 3 hottest takes, with the rest a tap away', async () => {
    const takes = [1, 2, 3, 4, 5].map(n => song(`50${n}`, `Take ${n}`, 'Artist'));
    serve({
      '/me': () => user,
      // Scores 10 down to 6 against an AUX average of 5: Take 1 is the hottest.
      '/me/rankings': () => ({
        rankings: takes.map((t, i) => ranked(t, ID(10 + i), 'LOVED', i, 10 - i)),
      }),
      '/charts': () => ({ songs: [], albums: [] }),
      [`/charts/community/songs?ids=${takes.map((_, i) => ID(10 + i)).join(',')}`]: () => ({
        stats: takes.map((_, i) => ({ songId: ID(10 + i), listeners: 3, averageScore: 5 })),
      }),
    });
    const r = await show(<DiscoverScreen />);
    await act(async () => {});
    expect(texts(r)).toContain('Take 3');
    expect(texts(r)).not.toContain('Take 4');
    await choose(r, 'Show 2 more');
    expect(texts(r)).toContain('Take 5');
    await choose(r, 'Show less');
    expect(texts(r)).not.toContain('Take 4');
  });

  it('shows your score and AUX’s next to search results', async () => {
    serve({
      '/me': () => user,
      '/me/rankings': () => ({ rankings: [ranked(eclipse, ID(1), 'LOVED', 0, 10)] }),
      '/charts': () => ({ songs: [], albums: [] }),
      '/songs/search?q=drake': () => ({
        results: [{ ...eclipse, songId: ID(1) }, janice],
        albums: [habibti],
        usedFallback: false,
      }),
      [`/charts/community/songs?ids=${ID(1)}`]: () => ({
        stats: [{ songId: ID(1), listeners: 5, averageScore: 8.75 }],
      }),
    });
    const r = await show(<DiscoverScreen />);
    await act(async () => r.root.findByType(TextInput).props.onChangeText('drake'));
    await act(async () => {
      await new Promise<void>(res => setTimeout(res, 450));
    });
    await act(async () => {});
    const t = texts(r);
    expect(t).toMatch(/Solar Eclipse\n.*\nYOU\n10\.00\nAUX\n8\.75/);
    // Nobody has ranked Janice: both scores are blank.
    expect(t).toMatch(/Janice STFU\n.*\nYOU\n—\nAUX\n—/);
    await choose(r, 'Albums');
    expect(texts(r)).toContain('HABIBTI (FOMO)');
  });
});

describe('Rank', () => {
  it('puts your queue first and suggests charting songs in genres you love', async () => {
    const queued = musicFromSearch(janice);
    registerMusic([queued]);
    serve({
      '/me': () => user,
      '/me/rankings': () => ({ rankings: [ranked(eclipse, ID(1), 'LOVED', 0, 10)] }),
      // You love a Hip-Hop/Rap song, so the hip-hop chart (18) is asked for.
      '/charts?genre=18': () => ({ songs: [eclipse, texas], albums: [] }),
      '/charts': () => ({ songs: [texas], albums: [] }),
    });
    const r = await show(<RankScreen />);
    await act(async () => {});
    // The rank queue is device state: add Janice, then look again.
    const add = r.root.find(
      n => n.props.accessibilityLabel === 'Add Choosin’ Texas to queue',
    );
    await act(async () => add.props.onPress());
    const t = texts(r);
    expect(t).toContain('UP NEXT');
    expect(t).toMatch(/UP NEXT\nChoosin’ Texas/);
    // Already-ranked Solar Eclipse is never suggested.
    expect(t).not.toMatch(/Solar Eclipse\nDrake & Don Toliver · Big in/);
    expect(calls('/charts?genre=18')).toBe(1);
  });

  it('ranks your favourite genres by how much you love them', () => {
    registerMusic([
      musicFromSearch(song('901', 'Rap One', 'A')),
      musicFromSearch({ ...song('902', 'Country One', 'B'), genre: 'Country' }),
      musicFromSearch({ ...song('903', 'Hated', 'C'), genre: 'Rock' }),
    ]);
    // One loved country song outweighs one fine rap song; disliked genres never count.
    expect(
      topGenres([
        { musicId: 'ap:901', sentiment: 'FINE' },
        { musicId: 'ap:902', sentiment: 'LOVED' },
        { musicId: 'ap:903', sentiment: 'DISLIKED' },
      ]),
    ).toEqual(['6', '18']);
  });
});

describe('Library', () => {
  it('lists your rankings best first, grouped by reaction, with real positions when filtered', async () => {
    serve({
      '/me': () => user,
      '/me/rankings': () => ({
        rankings: [
          ranked(eclipse, ID(1), 'LOVED', 0, 10),
          ranked(texas, ID(2), 'FINE', 0, 6.66),
          ranked(janice, ID(3), 'DISLIKED', 0, 3.33),
        ],
      }),
    });
    const r = await show(<LibraryScreen />);
    const t = texts(r);
    expect(t).toMatch(/LOVED IT\n1 song\n1\nSolar Eclipse/);
    expect(t).toMatch(/IT WAS FINE\n1 song\n2\nChoosin’ Texas/);
    await choose(r, 'Disliked');
    expect(texts(r)).toMatch(/3\nJanice STFU/);
    expect(texts(r)).not.toContain('Solar Eclipse');
  });
});

describe('Library: removing songs', () => {
  it('takes out a song you select, once you confirm', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _message, buttons) =>
        buttons?.find(b => b.style === 'destructive')?.onPress?.(),
      );
    serve({
      '/me': () => user,
      '/me/rankings': () => ({
        rankings: [ranked(eclipse, ID(1), 'LOVED', 0, 10), ranked(texas, ID(2), 'LOVED', 1, 8.34)],
      }),
      [`/me/rankings/${ID(1)}`]: () => ({ rankings: [ranked(texas, ID(2), 'LOVED', 0, 10)] }),
    });
    const r = await show(<LibraryScreen />);
    expect(r.root.findAll(n => n.props.accessibilityLabel === 'Remove Solar Eclipse from your rankings')).toHaveLength(0);
    await choose(r, 'Select');
    const remove = r.root
      .findAll(n => typeof n.props.onPress === 'function')
      .find(n => n.props.accessibilityLabel === 'Remove Solar Eclipse from your rankings')!;
    await act(async () => remove.props.onPress());
    await act(async () => {});
    expect(alert).toHaveBeenCalledWith('Remove from your rankings?', expect.any(String), expect.any(Array));
    const deleted = fetchMock.mock.calls.filter(
      ([url, init]) => String(url).endsWith(`/me/rankings/${ID(1)}`) && init?.method === 'DELETE',
    );
    expect(deleted).toHaveLength(1);
    const t = texts(r);
    expect(t).not.toContain('Solar Eclipse');
    // Texas moves up to the top of the band.
    expect(t).toMatch(/Choosin’ Texas[\s\S]*10\.00/);
    alert.mockRestore();
  });
});

describe('Add', () => {
  it('reads a playlist link, lets you untick songs, and queues the rest', async () => {
    serve({
      '/me': () => user,
      '/me/rankings': () => ({ rankings: [ranked(eclipse, ID(1), 'LOVED', 0, 10)] }),
    });
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      String(url).endsWith('/playlists/import')
        ? Promise.resolve(
            new Response(
              JSON.stringify({
                name: 'Gym',
                provider: 'spotify',
                tracks: [eclipse, texas, janice],
                unmatched: [{ title: 'Lost Song', artist: 'Someone' }],
                truncated: false,
              }),
              { status: 200 },
            ),
          )
        : base(url, init),
    );
    const r = await show(<AddScreen />);
    const input = r.root.findByProps({ accessibilityLabel: 'Playlist link' });
    await act(async () => input.props.onChangeText('not a link'));
    await choose(r, 'Find the songs');
    expect(texts(r)).toContain('doesn’t look like a playlist link');

    await act(async () =>
      input.props.onChangeText('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'),
    );
    await choose(r, 'Find the songs');
    expect(texts(r)).toContain('Found 3 songs · 1 couldn’t be matched');
    // You already ranked Solar Eclipse, so only two start ticked.
    expect(texts(r)).toContain('Already ranked');
    expect(texts(r)).toContain('Add 2 to rank queue');
    const janiceRow = r.root.find(
      n => n.props.accessibilityLabel === 'Janice STFU by Drake' && n.props.accessibilityRole === 'checkbox',
    );
    await act(async () => janiceRow.props.onPress());
    await choose(r, 'Add 1 to rank queue');
    expect(texts(r)).toContain('1 song from “Gym”');
    // Each account keeps its own queue on the device.
    const queueKey = (await AsyncStorage.getAllKeys()).find(
      k => k.startsWith('@aux/queue/v5/') && k !== '@aux/queue/v5/guest',
    )!;
    expect(JSON.parse((await AsyncStorage.getItem(queueKey))!).saved).toContain('ap:102');
  });
});

describe('Profile', () => {
  it('sums up your rankings: counts, average, reaction mix, genres and agreement with AUX', async () => {
    serve({
      '/me': () => user,
      '/me/rankings': () => ({
        rankings: [
          ranked(eclipse, ID(1), 'LOVED', 0, 10),
          ranked(texas, ID(2), 'FINE', 0, 5),
        ],
      }),
      [`/charts/community/songs?ids=${ID(1)},${ID(2)}`]: () => ({
        stats: [
          { songId: ID(1), listeners: 3, averageScore: 9 },
          { songId: ID(2), listeners: 1, averageScore: 5 },
        ],
      }),
    });
    const r = await show(<ProfileScreen />);
    await act(async () => {});
    const t = texts(r);
    expect(t).toContain('@armaan');
    expect(t).toMatch(/2\nsongs ranked\n7\.50\naverage score/);
    expect(t).toMatch(/Loved it\n1/);
    expect(t).toMatch(/It was fine\n1/);
    expect(t).toContain('50%');
    // Only Solar Eclipse has other listeners; you're 1.00 off AUX there.
    expect(t).toContain('90% in tune');
    expect(t).toContain('Based on 1 song other people ranked too.');
    expect(t).toContain('Hip-Hop/Rap');
  });
});
