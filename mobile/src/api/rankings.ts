import { request } from './client';
import type { SearchResult } from './songs';
import type { Sentiment } from '../data/prototype';

/** A ranking as GET /me/rankings returns it. */
export type RankedSong = {
  sentiment: Sentiment;
  /** 0-based spot inside the sentiment band; 0 is the best. */
  position: number;
  score: number;
  rankedAt: string;
  song: Omit<SearchResult, 'songId'> & { id: string; genre: string | null };
};

/** Best first: all LOVED songs, then FINE, then DISLIKED. */
export type RankingsResponse = { rankings: RankedSong[] };

export function getRankings() {
  return request<RankingsResponse>('/me/rankings');
}

/** Adds or moves a song. `position` is counted without the song itself. */
export function placeRanking(
  songId: string,
  sentiment: Sentiment,
  position: number,
) {
  return request<RankingsResponse>(`/me/rankings/${songId}`, {
    method: 'PUT',
    body: JSON.stringify({ sentiment, position }),
  });
}
