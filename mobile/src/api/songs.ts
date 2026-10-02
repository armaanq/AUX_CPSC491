import { API_BASE_URL } from './config';

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

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, init);
  } catch (err) {
    if (init?.signal?.aborted) throw err;
    throw new ApiError(
      `Can't reach the AUX server at ${API_BASE_URL}. Is \`npm run start:dev\` running in server/?`,
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message)
      ? body?.message.join(', ')
      : body?.message;
    throw new ApiError(message || `Server error ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, externalId }),
  });
}
