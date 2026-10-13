import { ApiError, request } from './client';
import type { SearchResult } from './songs';

export type PlaylistImport = {
  name: string;
  provider: 'apple' | 'spotify';
  /** Playlist order, each a catalog song the app can queue and rank. */
  tracks: SearchResult[];
  /** Songs AUX couldn't find a confident match for (Spotify links only). */
  unmatched: { title: string; artist: string }[];
  /** The playlist was longer than one import reads. */
  truncated: boolean;
};

/** Reads an Apple Music or Spotify playlist link. Saves nothing on the server. */
export async function importPlaylist(url: string) {
  try {
    return await request<PlaylistImport>('/playlists/import', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  } catch (err) {
    // Nest answers "Cannot POST /playlists/import" when the server predates importing.
    if (err instanceof ApiError && err.status === 404 && /Cannot POST/i.test(err.message)) {
      throw new ApiError(
        'This AUX server doesn’t support playlist import yet. It needs the latest server code deployed.',
        404,
      );
    }
    throw err;
  }
}

/** Quick check before sending: is this plausibly a playlist link we support? */
export function looksLikePlaylistLink(text: string): boolean {
  return /(music\.apple\.com\/.*\/playlist\/|open\.spotify\.com\/.*playlist\/|^spotify:playlist:|(^|\/\/)spotify\.(app\.)?link\/)/i.test(
    text.trim(),
  );
}
