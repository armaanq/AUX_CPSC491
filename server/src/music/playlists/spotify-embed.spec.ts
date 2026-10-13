import { parseSpotifyEmbed, SpotifyEmbedClient } from './spotify-embed.js';

const page = (data: unknown) =>
  `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;

describe('parseSpotifyEmbed', () => {
  it('finds the track list wherever it sits in the page data', () => {
    const html = page({
      props: {
        pageProps: {
          state: {
            data: {
              entity: {
                name: 'Late Night',
                trackList: [
                  { uri: 'spotify:track:1', title: 'Ivy', subtitle: 'Frank Ocean' },
                  { uri: 'spotify:track:2', title: 'Pink + White', subtitle: 'Frank Ocean, Beyoncé' },
                  { uri: 'spotify:episode:3', title: '', subtitle: 'A podcast' },
                  { uri: 'spotify:episode:4', title: 'Ep. 12', subtitle: 'Some Show', entityType: 'episode' },
                ],
              },
            },
          },
        },
      },
    });
    expect(parseSpotifyEmbed(html)).toEqual({
      name: 'Late Night',
      entries: [
        { title: 'Ivy', artist: 'Frank Ocean' },
        { title: 'Pink + White', artist: 'Frank Ocean, Beyoncé' },
      ],
    });
  });

  it('returns null when the page has no readable track list', () => {
    expect(parseSpotifyEmbed('<html>nothing here</html>')).toBeNull();
    expect(parseSpotifyEmbed('<script id="__NEXT_DATA__">{not json</script>')).toBeNull();
    expect(parseSpotifyEmbed(page({ props: { trackList: [] } }))).toBeNull();
  });
});

describe('SpotifyEmbedClient.resolveShortLink', () => {
  const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });
  afterEach(() => vi.unstubAllGlobals());

  it('follows Spotify redirects to the playlist id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirect('https://spotify.app.link/xyz?$full_url=1'))
      .mockResolvedValueOnce(redirect('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new SpotifyEmbedClient().resolveShortLink('https://spotify.link/AbC')).resolves.toBe(
      '37i9dQZF1DXcBWIGoYBM5M',
    );
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
  });

  it('reads the id from a page when there is no redirect, and refuses to leave Spotify', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response('<a href="https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M">Open</a>', { status: 200 }),
      ),
    );
    await expect(new SpotifyEmbedClient().resolveShortLink('https://spotify.link/AbC')).resolves.toBe(
      '37i9dQZF1DXcBWIGoYBM5M',
    );
    const offsite = vi.fn().mockResolvedValueOnce(redirect('https://evil.example/x'));
    vi.stubGlobal('fetch', offsite);
    await expect(new SpotifyEmbedClient().resolveShortLink('https://spotify.link/AbC')).resolves.toBeNull();
    expect(offsite).toHaveBeenCalledTimes(1);
  });
});
