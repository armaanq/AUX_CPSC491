import { request } from './client';

export type CatalogSource = 'apple' | 'musicbrainz' | 'spotify';

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
  genre: string | null;
  artworkUrl: string | null;
  externalUrl: string;
  /** AUX song id if someone already ranked/saved it. */
  songId: string | null;
};

/** An album from search or GET /albums. Albums can be browsed and saved, not ranked. */
export type AlbumResult = {
  source: CatalogSource;
  externalId: string;
  title: string;
  artist: string;
  releaseYear: number | null;
  trackCount: number | null;
  genre: string | null;
  artworkUrl: string | null;
  externalUrl: string;
};

export type SearchResponse = {
  results: SearchResult[];
  /** Only Apple Music searches albums, so this is empty when search fell back to another catalog. */
  albums: AlbumResult[];
  usedFallback: boolean;
};

export async function searchSongs(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const body = await request<Partial<SearchResponse>>(
    `/songs/search?q=${encodeURIComponent(query)}`,
    { signal },
  );
  return {
    results: body.results ?? [],
    albums: body.albums ?? [],
    usedFallback: body.usedFallback ?? false,
  };
}

/** An album and its tracklist (Apple Music albums only). */
export function getAlbum(source: CatalogSource, externalId: string) {
  return request<{ album: AlbumResult; tracks: SearchResult[] }>(
    `/albums/${source}/${encodeURIComponent(externalId)}`,
  );
}

/**
 * Apple Music's 30-second clip for a song, or null when there isn't one.
 * Apple songs are found by id; MusicBrainz and Spotify songs by ISRC.
 */
export async function getPreviewUrl(song: {
  source?: CatalogSource;
  externalId?: string;
  isrc?: string;
}): Promise<string | null> {
  const params: string[] = [];
  if (song.source === 'apple' && song.externalId) {
    params.push(`source=apple&externalId=${encodeURIComponent(song.externalId)}`);
  }
  if (song.isrc) params.push(`isrc=${encodeURIComponent(song.isrc)}`);
  if (!params.length) return null;
  const { url } = await request<{ url: string | null }>(
    `/songs/preview?${params.join('&')}`,
  );
  return url;
}

/** Creates (or finds) the canonical AUX song. Call when a user acts on a song. */
export function resolveSong(source: CatalogSource, externalId: string) {
  return request<{ id: string }>('/songs/resolve', {
    method: 'POST',
    body: JSON.stringify({ source, externalId }),
  });
}

/** How to credit a catalog in the app. Apple Music and Spotify require attribution. */
export const SOURCE_NAMES: Record<CatalogSource, string> = {
  apple: 'Apple Music',
  musicbrainz: 'MusicBrainz',
  spotify: 'Spotify',
};
