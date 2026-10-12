/** Where a song or album's details come from. Matches the CatalogSource enum in schema.prisma. */
export type CatalogSourceName = 'apple' | 'musicbrainz' | 'spotify';

/** A song as GET /songs/search returns it. Mirrors mobile/src/api/songs.ts. */
export interface SearchResult {
  source: CatalogSourceName;
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
}

/** An album as GET /songs/search and GET /albums return it. Mirrors mobile/src/api/songs.ts. */
export interface AlbumResult {
  source: CatalogSourceName;
  externalId: string;
  title: string;
  artist: string;
  releaseYear: number | null;
  trackCount: number | null;
  genre: string | null;
  artworkUrl: string | null;
  externalUrl: string;
}

export function yearOf(date: string | undefined | null): number | null {
  const year = Number(date?.slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : null;
}
