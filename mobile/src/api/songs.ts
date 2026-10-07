import { request } from './client';

export type CatalogSource = 'musicbrainz' | 'spotify';

/** A song as GET /songs/search returns it. Not saved anywhere yet. */
export type SearchResult = {
  source: CatalogSource;
  externalId: string;
  title: string;
  artist: string;
  album: string | null;
  releaseYear: number | null;
  durationMs: number | null;
  isrc: string | null;
  artworkUrl: string | null;
  externalUrl: string;
  /** AUX song id if someone already ranked/saved it. */
  songId: string | null;
};

export function searchSongs(query: string, signal?: AbortSignal) {
  return request<{ results: SearchResult[]; usedFallback: boolean }>(
    `/songs/search?q=${encodeURIComponent(query)}`,
    { signal },
  );
}

/** Creates (or finds) the canonical AUX song. Call when a user acts on a song. */
export function resolveSong(source: CatalogSource, externalId: string) {
  return request<{ id: string }>('/songs/resolve', {
    method: 'POST',
    body: JSON.stringify({ source, externalId }),
  });
}
