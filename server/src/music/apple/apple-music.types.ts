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

/** A catalog playlist (curated, or one a user shared with a pl.u- link). */
export interface AmPlaylist {
  id: string;
  type: 'playlists';
  attributes?: { name: string; curatorName?: string; url: string };
  relationships?: {
    /** The first page of tracks; `next` is the path to the following page. */
    tracks?: { data: (AmSong | { id: string; type: string })[]; next?: string };
  };
}

/** A page of a playlist's tracks. */
export interface AmTracksPage {
  data?: (AmSong | { id: string; type: string })[];
  next?: string;
}
