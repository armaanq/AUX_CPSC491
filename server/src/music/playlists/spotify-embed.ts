import { Injectable } from '@nestjs/common';

/** A song as a playlist lists it: just the words, no catalog id we can use. */
export interface PlaylistEntry {
  title: string;
  artist: string;
}

export interface ParsedPlaylist {
  name: string | null;
  entries: PlaylistEntry[];
}

/**
 * Reads the track list out of Spotify's public embed page
 * (https://open.spotify.com/embed/playlist/<id>).
 *
 * AUX has no Spotify API access that can read other people's playlists, so
 * this reads the same page Spotify serves to embedded players: a Next.js page
 * whose `__NEXT_DATA__` script holds the playlist as JSON. Spotify can change
 * that page at any time, so instead of a fixed path this walks the JSON for
 * the first `trackList` array of `{ title, subtitle }` items. The embed lists
 * at most the first ~100 tracks.
 *
 * Returns null when the page has no track list (private playlist, page changed).
 */
export function parseSpotifyEmbed(html: string): ParsedPlaylist | null {
  const match = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) return null;
  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return null;
  }
  const found = findTrackList(data, 0);
  if (!found) return null;
  const entries = found.list.flatMap((item): PlaylistEntry[] => {
    if (!item || typeof item !== 'object') return [];
    const { title, subtitle, entityType } = item as { title?: unknown; subtitle?: unknown; entityType?: unknown };
    if (typeof title !== 'string' || !title.trim()) return [];
    // Playlists can hold podcast episodes; only songs can be matched and ranked.
    if (typeof entityType === 'string' && entityType !== 'track') return [];
    // Spotify joins several artists with a comma and a non-breaking space.
    const artist = typeof subtitle === 'string' ? subtitle.replace(/ /g, ' ').trim() : '';
    return [{ title: title.trim(), artist }];
  });
  return entries.length ? { name: found.name, entries } : null;
}

function findTrackList(node: unknown, depth: number): { list: unknown[]; name: string | null } | null {
  if (!node || typeof node !== 'object' || depth > 12) return null;
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj.trackList) && obj.trackList.length) {
    const name = typeof obj.name === 'string' ? obj.name : typeof obj.title === 'string' ? obj.title : null;
    return { list: obj.trackList, name };
  }
  for (const value of Object.values(obj)) {
    const found = findTrackList(value, depth + 1);
    if (found) return found;
  }
  return null;
}

/** The playlist doesn't exist, or is private (Spotify returns 404 for both). */
export class SpotifyPlaylistNotFoundError extends Error {}

/** Spotify couldn't be reached, or its page no longer has a readable track list. */
export class SpotifyEmbedUnavailableError extends Error {}

const EMBED_URL = 'https://open.spotify.com/embed/playlist/';
const TIMEOUT_MS = 8_000;
// Spotify serves the embed page (with its track list) to browsers; a bare
// client name can get a stripped-down page or a refusal.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Accept: 'text/html,application/xhtml+xml',
};
const PLAYLIST_IN_URL = /open\.spotify\.com\/(?:[a-z-]+\/)?playlist\/([A-Za-z0-9]{22})/;

/** Fetches and parses a public Spotify playlist's embed page. See parseSpotifyEmbed. */
@Injectable()
export class SpotifyEmbedClient {
  async playlist(id: string): Promise<ParsedPlaylist> {
    let res: Response;
    try {
      res = await fetch(`${EMBED_URL}${encodeURIComponent(id)}`, {
        headers: HEADERS,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new SpotifyEmbedUnavailableError(`Spotify request failed: ${(err as Error).message}`);
    }
    if (res.status === 404) throw new SpotifyPlaylistNotFoundError(`No public playlist ${id}`);
    if (!res.ok) throw new SpotifyEmbedUnavailableError(`Spotify responded ${res.status}`);
    const parsed = parseSpotifyEmbed(await res.text());
    if (!parsed) throw new SpotifyEmbedUnavailableError('Spotify’s playlist page has no track list AUX can read');
    return parsed;
  }

  /**
   * The playlist id behind a spotify.link short link. Follows redirects one
   * hop at a time (never fetching anything outside Spotify) until a playlist
   * URL appears; short links that point at a song or album resolve to null.
   */
  async resolveShortLink(url: string): Promise<string | null> {
    let next = url;
    for (let hop = 0; hop < 4; hop++) {
      let res: Response;
      try {
        res = await fetch(next, { headers: HEADERS, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (err) {
        throw new SpotifyEmbedUnavailableError(`Spotify short link failed: ${(err as Error).message}`);
      }
      const location = res.headers.get('location');
      if (location) {
        const found = PLAYLIST_IN_URL.exec(location);
        if (found) return found[1];
        const host = new URL(location, next).hostname;
        if (!/(^|\.)spotify\.(com|link|app\.link)$/.test(host)) return null;
        next = new URL(location, next).toString();
        continue;
      }
      if (res.status === 404) throw new SpotifyPlaylistNotFoundError(`Short link ${url} doesn't exist`);
      // Some short links answer with a page that names the target instead of redirecting.
      const body = res.ok ? await res.text() : '';
      return PLAYLIST_IN_URL.exec(body)?.[1] ?? null;
    }
    return null;
  }
}
