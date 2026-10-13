/** A playlist link the app can import, reduced to what's needed to fetch it. */
export type PlaylistLink =
  | { provider: 'apple'; storefront: string; id: string }
  | { provider: 'spotify'; id: string }
  /** A spotify.link short link: has to be followed to find the playlist. */
  | { provider: 'spotify-short'; url: string };

/** Hosts Spotify's share sheet uses for short links. */
export const SPOTIFY_SHORT_HOSTS = new Set(['spotify.link', 'spotify.app.link']);

const APPLE_HOSTS = new Set(['music.apple.com', 'embed.music.apple.com', 'itunes.apple.com']);
const SPOTIFY_HOSTS = new Set(['open.spotify.com', 'play.spotify.com']);
// pl.<hex> is an Apple curated playlist; pl.u-<id> is a playlist a user shared.
const APPLE_PLAYLIST_ID = /^pl\.(u-)?[A-Za-z0-9]{6,64}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const STOREFRONT = /^[a-z]{2}$/;

/**
 * Reads the playlist out of a share link. Accepts what the share sheets produce:
 *   https://music.apple.com/us/playlist/late-night/pl.u-AbCdEf123
 *   https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc
 *   https://open.spotify.com/intl-de/playlist/37i9dQZF1DXcBWIGoYBM5M
 *   spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
 *   https://spotify.link/AbCdEf1234 (the iPhone share sheet's short link)
 * Returns null for anything else (albums, songs, other sites).
 */
export function parsePlaylistLink(raw: unknown): PlaylistLink | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();

  const uri = /^spotify:playlist:([A-Za-z0-9]{22})$/.exec(text);
  if (uri) return { provider: 'spotify', id: uri[1] };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  if (APPLE_HOSTS.has(host)) {
    const at = parts.indexOf('playlist');
    if (at < 0) return null;
    // The id is the last path part; the name slug before it is optional.
    const id = parts[parts.length - 1];
    if (!APPLE_PLAYLIST_ID.test(id) || parts.length - 1 <= at) return null;
    const storefront = STOREFRONT.test(parts[0] ?? '') ? parts[0] : 'us';
    return { provider: 'apple', storefront, id };
  }

  if (SPOTIFY_SHORT_HOSTS.has(host)) {
    return parts.length === 1 && /^[A-Za-z0-9_-]{4,40}$/.test(parts[0])
      ? { provider: 'spotify-short', url: `https://${host}/${parts[0]}` }
      : null;
  }

  if (SPOTIFY_HOSTS.has(host)) {
    const at = parts.indexOf('playlist');
    const id = at >= 0 ? parts[at + 1] : undefined;
    return id && SPOTIFY_ID.test(id) ? { provider: 'spotify', id } : null;
  }

  return null;
}
