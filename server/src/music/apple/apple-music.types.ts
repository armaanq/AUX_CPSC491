// The parts of Apple Music API responses AUX reads.
// https://developer.apple.com/documentation/applemusicapi

export interface AmArtwork {
  /** Template with {w} and {h} placeholders for the image size. */
  url: string;
  width?: number;
  height?: number;
}

export interface AmSong {
  id: string;
  type: 'songs';
  attributes?: {
    name: string;
    artistName: string;
    albumName?: string;
    releaseDate?: string;
    durationInMillis?: number;
    isrc?: string;
    genreNames?: string[];
    artwork?: AmArtwork;
    /** e.g. https://music.apple.com/us/album/ivy/1146195596?i=1146195713 */
    url: string;
  };
}

export interface AmAlbum {
  id: string;
  type: 'albums';
  attributes?: {
    name: string;
    artistName: string;
    releaseDate?: string;
    trackCount?: number;
    genreNames?: string[];
    artwork?: AmArtwork;
    url: string;
  };
  relationships?: {
    /** Included when an album is fetched by id, not in search results. */
    tracks?: { data: (AmSong | { id: string; type: string })[] };
  };
}

export interface AmSearchResponse {
  results?: {
    songs?: { data: AmSong[] };
    albums?: { data: AmAlbum[] };
  };
}

/** GET /charts: one chart per type (e.g. "Top Songs", most played). */
export interface AmChartsResponse {
  results?: {
    songs?: { name?: string; data: AmSong[] }[];
    albums?: { name?: string; data: AmAlbum[] }[];
  };
}

export interface AmDataResponse<T> {
  data?: T[];
}
