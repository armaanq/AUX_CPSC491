import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { PlayableCover, PreviewCredit } from '../src/components/PlayableCover';
import type { Music } from '../src/data/prototype';
import { PreviewProvider } from '../src/state/PreviewProvider';

const CLIP = 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/ivy.m4a';
const OTHER = 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/nights.m4a';

const song = (id: string, extra: Partial<Music> = {}): Music => ({
  id,
  title: id,
  artist: 'Frank Ocean',
  genre: 'R&B',
  kind: 'song',
  albumTitle: 'Blonde',
  ...extra,
});
const ivy = song('apple:1146195713', { source: 'apple', externalId: '1146195713' });
const nights = song('apple:1146195720', { source: 'apple', externalId: '1146195720' });
const mbSong = song('mb:abc', { source: 'musicbrainz', externalId: 'abc', isrc: 'USUM71607007' });
const silent = song('apple:999', { source: 'apple', externalId: '999' });

const fetchMock = jest.fn((url: string) => {
  const u = new URL(url);
  const id = u.searchParams.get('externalId');
  const isrc = u.searchParams.get('isrc');
  const body =
    id === '1146195713' || isrc === 'USUM71607007'
      ? { url: CLIP }
      : id === '1146195720'
      ? { url: OTHER }
      : { url: null };
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
});
globalThis.fetch = fetchMock as unknown as typeof fetch;
beforeEach(() => fetchMock.mockClear());

async function render(items: Music[]) {
  let r: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      <PreviewProvider>
        {items.map(m => (
          <PlayableCover key={m.id} item={m} size={100} />
        ))}
        <PreviewCredit items={items} />
      </PreviewProvider>,
    );
  });
  return r!;
}
const button = (r: TestRenderer.ReactTestRenderer, label: RegExp) =>
  r.root.find(n => typeof n.props.onPress === 'function' && label.test(n.props.accessibilityLabel ?? ''));
const player = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll(n => n.props.testID === 'preview-player' && n.props.source)[0];
const press = async (r: TestRenderer.ReactTestRenderer, label: RegExp) => {
  await act(async () => button(r, label).props.onPress());
};
const text = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAll(n => typeof n.props.children === 'string')
    .map(n => n.props.children)
    .join(' | ');

it('plays, pauses and resumes a song’s preview', async () => {
  const r = await render([ivy]);
  expect(player(r)).toBeUndefined();

  await press(r, /Play a preview of apple:1146195713/);
  expect(fetchMock.mock.calls[0][0]).toContain('/songs/preview?source=apple&externalId=1146195713');
  expect(player(r).props.source).toEqual({ uri: CLIP });
  expect(player(r).props.paused).toBe(false);
  expect(text(r)).toContain('Previews courtesy of Apple Music');

  await press(r, /Pause/);
  expect(player(r).props.paused).toBe(true);
  await press(r, /Resume/);
  expect(player(r).props.paused).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('plays one preview at a time', async () => {
  const r = await render([ivy, nights]);
  await press(r, /Play a preview of apple:1146195713/);
  await press(r, /Play a preview of apple:1146195720/);
  // (The mock player shows up as a few test nodes; they're all one player.)
  const playing = r.root
    .findAll(n => n.props.testID === 'preview-player' && n.props.source)
    .map(n => n.props.source.uri);
  expect([...new Set(playing)]).toEqual([OTHER]);
  // Back to the first: its url is remembered, so no second lookup.
  await press(r, /Play a preview of apple:1146195713/);
  expect(player(r).props.source).toEqual({ uri: CLIP });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('stops when the clip ends', async () => {
  const r = await render([ivy]);
  await press(r, /Play a preview/);
  await act(async () => player(r).props.onEnd());
  expect(player(r)).toBeUndefined();
  expect(button(r, /Play a preview/)).toBeTruthy();
});

it('finds MusicBrainz songs by ISRC', async () => {
  const r = await render([mbSong]);
  await press(r, /Play a preview/);
  expect(fetchMock.mock.calls[0][0]).toContain('/songs/preview?isrc=USUM71607007');
  expect(player(r).props.source).toEqual({ uri: CLIP });
});

it('says so when Apple Music has no preview', async () => {
  const r = await render([silent]);
  await press(r, /Play a preview/);
  expect(player(r)).toBeUndefined();
  const b = button(r, /No preview/);
  expect(b.props.disabled).toBe(true);
  expect(text(r)).toContain('doesn’t have a preview');
});

it('shows a plain cover for albums and demo songs', async () => {
  const r = await render([
    song('album', { kind: 'album', source: 'apple', externalId: '1' }),
    song('demo'),
  ]);
  expect(r.root.findAll(n => /preview/i.test(n.props.accessibilityLabel ?? ''))).toHaveLength(0);
});
