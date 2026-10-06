// The subset of the MusicBrainz JSON web service (ws/2) that AUX reads.
// Reference: https://musicbrainz.org/doc/MusicBrainz_API

export interface MbArtistCredit {
  name: string;
  joinphrase?: string;
  artist?: { id: string; name: string };
}

export interface MbReleaseGroup {
  id: string;
  title?: string;
  'primary-type'?: string | null;
  'secondary-types'?: string[];
}

export interface MbRelease {
  id: string;
  title: string;
  status?: string | null;
  date?: string;
  'release-group'?: MbReleaseGroup;
}

export interface MbRecording {
  id: string;
  /** 0-100 relevance; only present on search results. */
  score?: number;
  title: string;
  /** Milliseconds. */
  length?: number | null;
  video?: boolean;
  'first-release-date'?: string;
  'artist-credit'?: MbArtistCredit[];
  releases?: MbRelease[];
  isrcs?: string[];
}

export interface MbRecordingSearchResponse {
  created?: string;
  count: number;
  offset: number;
  recordings: MbRecording[];
}
