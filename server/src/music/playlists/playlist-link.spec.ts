import { parsePlaylistLink } from './playlist-link.js';

describe('parsePlaylistLink', () => {
  it('reads Apple Music share links, keeping the storefront', () => {
    expect(parsePlaylistLink('https://music.apple.com/gb/playlist/late-night/pl.u-AbCdEf12345')).toEqual({
      provider: 'apple',
      storefront: 'gb',
      id: 'pl.u-AbCdEf12345',
    });
    expect(parsePlaylistLink('music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb')).toEqual({
      provider: 'apple',
      storefront: 'us',
      id: 'pl.f4d106fed2bd41149aaacabb233eb5eb',
    });
  });

  it('reads Spotify links and URIs, ignoring tracking params and locale prefixes', () => {
    const want = { provider: 'spotify', id: '37i9dQZF1DXcBWIGoYBM5M' };
    expect(parsePlaylistLink('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123')).toEqual(want);
    expect(parsePlaylistLink(' https://open.spotify.com/intl-de/playlist/37i9dQZF1DXcBWIGoYBM5M ')).toEqual(want);
    expect(parsePlaylistLink('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')).toEqual(want);
  });

  it('recognizes the iPhone share sheet’s spotify.link short links', () => {
    expect(parsePlaylistLink('https://spotify.link/AbCdEf1234')).toEqual({
      provider: 'spotify-short',
      url: 'https://spotify.link/AbCdEf1234',
    });
    expect(parsePlaylistLink('spotify.app.link/xY_z-9a?_p=c')).toEqual({
      provider: 'spotify-short',
      url: 'https://spotify.app.link/xY_z-9a',
    });
    expect(parsePlaylistLink('https://spotify.link/a/b')).toBeNull();
  });

  it('rejects albums, songs, other sites and junk', () => {
    expect(parsePlaylistLink('https://music.apple.com/us/album/blonde/1146195596')).toBeNull();
    expect(parsePlaylistLink('https://open.spotify.com/track/7KA4W4McWYRpgf0fWsJZWB')).toBeNull();
    expect(parsePlaylistLink('https://example.com/playlist/pl.u-AbCdEf12345')).toBeNull();
    expect(parsePlaylistLink('not a link')).toBeNull();
    expect(parsePlaylistLink(42)).toBeNull();
  });
});
