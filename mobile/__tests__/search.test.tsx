import React from 'react';
import { Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { API_BASE_URL, USING_LOCAL_SERVER } from '../src/api/config';
import {
  searchSongs,
  resolveSong,
  type AlbumResult,
  type SearchResult,
} from '../src/api/songs';
import {
  findMusic,
  music,
  musicFromAlbum,
  musicFromSearch,
  registerMusic,
} from '../src/data/prototype';
import { MusicDetailScreen, SearchScreen } from '../src/screens/DiscoverScreens';
import { AuthProvider } from '../src/state/AuthProvider';
import { RankingsProvider } from '../src/state/RankingsProvider';
import { clearChartsCache } from '../src/state/useCharts';
import {
  PrototypeProvider,
  usePrototype,
} from '../src/state/PrototypeProvider';

const mockNavigate = jest.fn();
const mockPush = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, push: mockPush }),
}));

const ivy: SearchResult = {
  source: 'apple',
  externalId: '1146195713',
  title: 'Ivy',
  artist: 'Frank Ocean',
  album: 'Blonde',
  releaseYear: 2016,
  durationMs: 249191,
  isrc: 'QZ5C81600002',
  genre: 'Pop',
  artworkUrl: 'https://is1-ssl.mzstatic.com/blonde/600x600bb.jpg',
  externalUrl: 'https://music.apple.com/us/album/ivy/1146195596?i=1146195713',
  songId: null,
};
const nikes: SearchResult = {
  ...ivy,
  externalId: '1146195712',
  title: 'Nikes',
  isrc: 'QZ5C81600001',
  externalUrl: 'https://music.apple.com/us/album/nikes/1146195596?i=1146195712',
};
const blonde: AlbumResult = {
  source: 'apple',
  externalId: '1146195596',
  title: 'Blonde',
  artist: 'Frank Ocean',
  releaseYear: 2016,
  trackCount: 17,
  genre: 'Pop',
  artworkUrl: 'https://is1-ssl.mzstatic.com/blonde/600x600bb.jpg',
  externalUrl: 'https://music.apple.com/us/album/blonde/1146195596',
};
const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;
const ok = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

let current: ReturnType<typeof usePrototype>;
function Probe() {
  current = usePrototype();
  return null;
}
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
async function mount(child: React.ReactNode = null) {
  let r: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <PrototypeProvider>
          <Probe />
          {child}
        </PrototypeProvider>
      </SafeAreaProvider>,
    );
  });
  return r!;
}
const texts = (r: Pick<TestRenderer.ReactTestRenderer, 'root'>) =>
  r.root
    .findAllByType(Text)
    .map(t => [t.props.children].flat().join(''))
    .join('\n');
/** Taps the filter chip (or button) whose text is exactly `label`. */
async function choose(r: TestRenderer.ReactTestRenderer, label: string) {
  const target = r.root
    .findAll(n => typeof n.props.onPress === 'function')
    .find(n => texts({ root: n }) === label);
  if (!target) throw new Error(`No button "${label}"`);
  await act(async () => target.props.onPress());
}

/**
 * Answers searches with `search` and everything else (the chart Discover
 * loads when it opens) with an empty chart, so the two never mix up.
 */
function serveSearch(search: () => Promise<Response>) {
  fetchMock.mockImplementation((url: string) =>
    url.includes('/songs/search') ? search() : ok({ songs: [], albums: [] }),
  );
}
const searchCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes('/songs/search'));

beforeEach(async () => {
  fetchMock.mockReset();
  mockNavigate.mockReset();
  clearChartsCache();
  await AsyncStorage.clear();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('api client', () => {
  it('encodes the query and returns songs and albums', async () => {
    fetchMock.mockReturnValueOnce(
      ok({ results: [ivy], albums: [blonde], usedFallback: false }),
    );
    const r = await searchSongs('ivy & nights');
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${API_BASE_URL}/songs/search?q=ivy%20%26%20nights`,
    );
    expect(r.results[0].title).toBe('Ivy');
    expect(r.albums[0].title).toBe('Blonde');
  });

  it('copes with a server that doesn’t send albums yet', async () => {
    fetchMock.mockReturnValueOnce(ok({ results: [ivy], usedFallback: false }));
    expect((await searchSongs('ivy')).albums).toEqual([]);
  });

  it('uses the shared server, so nobody needs to run server/ to use the app', () => {
    // Fails if USE_LOCAL_SERVER in src/api/config.ts was committed as true.
    expect(USING_LOCAL_SERVER).toBe(false);
    expect(API_BASE_URL).toMatch(/^https:\/\//);
  });

  it('explains when the server is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(searchSongs('ivy')).rejects.toThrow(
      /Can't reach the AUX server. Check your internet connection/,
    );
  });

  it('passes the server error message through', async () => {
    fetchMock.mockReturnValueOnce(
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Music search is busy.' }), {
          status: 503,
        }),
      ),
    );
    await expect(resolveSong('apple', ivy.externalId)).rejects.toThrow(
      'Music search is busy.',
    );
  });
});

describe('SearchScreen', () => {
  it('waits for typing to pause, then shows songs and albums with Apple Music credit', async () => {
    jest.useFakeTimers();
    serveSearch(() =>
      ok({ results: [ivy], albums: [blonde], usedFallback: false }),
    );
    const r = await mount(<SearchScreen />);
    const input = r.root.findByType(TextInput);
    await act(async () => input.props.onChangeText('iv'));
    await act(async () => input.props.onChangeText('ivy'));
    expect(searchCalls()).toHaveLength(0); // still waiting for a pause
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    jest.useRealTimers();
    await act(async () => {});
    expect(searchCalls()).toHaveLength(1);
    expect(texts(r)).toContain('Frank Ocean · Blonde');
    expect(texts(r)).toContain('Frank Ocean · album');
    expect(texts(r)).toContain('Results from Apple Music');
    expect(findMusic('ap:1146195713').title).toBe('Ivy');
    expect(findMusic('ap-album:1146195596').kind).toBe('album');
    await act(async () => r.unmount());
  });

  it('filters to just songs or just albums', async () => {
    serveSearch(() =>
      ok({ results: [ivy], albums: [blonde], usedFallback: false }),
    );
    const r = await mount(<SearchScreen />);
    await act(async () =>
      r.root.findByType(TextInput).props.onChangeText('blonde'),
    );
    await act(async () => {
      await new Promise<void>(res => setTimeout(res, 450));
    });
    await choose(r, 'Albums');
    expect(texts(r)).toContain('Frank Ocean · album');
    expect(texts(r)).not.toContain('Frank Ocean · Blonde');
    await choose(r, 'Songs');
    expect(texts(r)).toContain('Frank Ocean · Blonde');
    expect(texts(r)).not.toContain('Frank Ocean · album');
    await act(async () => r.unmount());
  });

  it('shows why search failed', async () => {
    serveSearch(() => Promise.reject(new TypeError('Network request failed')));
    const r = await mount(<SearchScreen />);
    await act(async () =>
      r.root.findByType(TextInput).props.onChangeText('ivy'),
    );
    await act(async () => {
      await new Promise<void>(res => setTimeout(res, 450));
    });
    expect(texts(r)).toContain('Search is unavailable');
    await act(async () => r.unmount());
  });
});

describe('catalog songs in your library', () => {
  // Rankings come from the server now; saved and pinned songs still live on the device.
  it('a saved catalog song survives an app restart', async () => {
    const item = musicFromSearch({
      ...ivy,
      source: 'musicbrainz',
      externalId: 'b1a9c0e9-d987-4042-ae91-78d6a3267d69',
    });
    registerMusic([item]);
    const r = await mount();
    await act(async () => current.toggleSaved(item.id));
    expect(current.state.library.map(m => m.id)).toEqual([item.id]);
    await act(async () => r.unmount());

    // Simulate a fresh app launch: the song is no longer in memory.
    music.splice(
      music.findIndex(m => m.id === item.id),
      1,
    );
    const again = await mount();
    expect(current.error).toBeNull();
    expect(current.state.saved).toContain(item.id);
    expect(findMusic(item.id).title).toBe('Ivy');
    await act(async () => again.unmount());
  });

  it('a pinned Apple Music album survives an app restart', async () => {
    const item = musicFromAlbum(blonde);
    registerMusic([item]);
    const r = await mount();
    await act(async () => current.toggleFavorite(item.id));
    await act(async () => r.unmount());

    music.splice(
      music.findIndex(m => m.id === item.id),
      1,
    );
    const again = await mount();
    expect(current.error).toBeNull();
    expect(current.state.favorites).toContain(item.id);
    expect(findMusic(item.id)).toMatchObject({ kind: 'album', title: 'Blonde' });
    await act(async () => again.unmount());
  });
});

describe('album page', () => {
  it('loads the tracklist, and each song opens its own page', async () => {
    const album = musicFromAlbum(blonde);
    registerMusic([album]);
    fetchMock.mockReturnValueOnce(ok({ album: blonde, tracks: [nikes, ivy] }));
    const route = { params: { musicId: album.id } };
    const r = await mount(
      <AuthProvider>
        <RankingsProvider>
          <MusicDetailScreen route={route as never} navigation={{} as never} />
        </RankingsProvider>
      </AuthProvider>,
    );
    await act(async () => {});
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${API_BASE_URL}/albums/apple/1146195596`,
    );
    expect(texts(r)).toContain('album / Apple Music');
    expect(texts(r)).toContain('Tracklist');
    expect(texts(r)).toContain('2 songs');
    expect(texts(r)).toContain('Open in Apple Music ↗');

    const row = r.root.find(
      n =>
        n.props.accessibilityLabel === 'Ivy, Frank Ocean' &&
        typeof n.props.onPress === 'function',
    );
    await act(async () => row.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('MusicDetail', {
      musicId: 'ap:1146195713',
    });
    expect(findMusic('ap:1146195713').title).toBe('Ivy');
    await act(async () => r.unmount());
  });

  it('explains when the tracklist can’t load', async () => {
    const album = musicFromAlbum(blonde);
    registerMusic([album]);
    fetchMock.mockReturnValueOnce(
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Apple Music is busy.' }), {
          status: 503,
        }),
      ),
    );
    const r = await mount(
      <AuthProvider>
        <RankingsProvider>
          <MusicDetailScreen
            route={{ params: { musicId: album.id } } as never}
            navigation={{} as never}
          />
        </RankingsProvider>
      </AuthProvider>,
    );
    await act(async () => {});
    expect(texts(r)).toContain('Couldn’t load the songs');
    expect(texts(r)).toContain('Apple Music is busy.');
    await act(async () => r.unmount());
  });
});
