import React from 'react';
import { Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { API_BASE_URL, USING_LOCAL_SERVER } from '../src/api/config';
import { searchSongs, resolveSong, type SearchResult } from '../src/api/songs';
import {
  findMusic,
  music,
  musicFromSearch,
  registerMusic,
} from '../src/data/prototype';
import { SearchScreen } from '../src/screens/DiscoverScreens';
import {
  PrototypeProvider,
  usePrototype,
} from '../src/state/PrototypeProvider';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const ivy: SearchResult = {
  source: 'spotify',
  externalId: '2ZWlPOoWh0626oTaHrnl2a',
  title: 'Ivy',
  artist: 'Frank Ocean',
  album: 'Blonde',
  releaseYear: 2016,
  durationMs: 249191,
  isrc: 'USUM71607007',
  artworkUrl: 'https://i.scdn.co/300',
  externalUrl: 'https://open.spotify.com/track/2ZWlPOoWh0626oTaHrnl2a',
  songId: null,
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
const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(Text)
    .map(t => [t.props.children].flat().join(''))
    .join('\n');

beforeEach(async () => {
  fetchMock.mockReset();
  mockNavigate.mockReset();
  await AsyncStorage.clear();
});

describe('api client', () => {
  it('encodes the query and returns results', async () => {
    fetchMock.mockReturnValueOnce(ok({ results: [ivy], usedFallback: true }));
    const r = await searchSongs('ivy & nights');
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${API_BASE_URL}/songs/search?q=ivy%20%26%20nights`,
    );
    expect(r.results[0].title).toBe('Ivy');
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
    await expect(resolveSong('spotify', ivy.externalId)).rejects.toThrow(
      'Music search is busy.',
    );
  });
});

describe('SearchScreen', () => {
  it('waits for typing to pause, then shows real results with Spotify credit', async () => {
    jest.useFakeTimers();
    fetchMock.mockReturnValue(ok({ results: [ivy], usedFallback: true }));
    const r = await mount(<SearchScreen />);
    const input = r.root.findByType(TextInput);
    await act(async () => input.props.onChangeText('iv'));
    await act(async () => input.props.onChangeText('ivy'));
    expect(fetchMock).not.toHaveBeenCalled(); // still waiting for a pause
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    jest.useRealTimers();
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(texts(r)).toContain('Frank Ocean · Blonde · via Spotify');
    expect(findMusic('sp:2ZWlPOoWh0626oTaHrnl2a').title).toBe('Ivy');
    await act(async () => r.unmount());
  });

  it('shows why search failed', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
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
});
