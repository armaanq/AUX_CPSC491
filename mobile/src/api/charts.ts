import { request } from './client';
import type { RankedSong } from './rankings';
import type { AlbumResult, SearchResult } from './songs';

/** Apple Music's most-played songs and albums right now. */
export type ChartsResponse = { songs: SearchResult[]; albums: AlbumResult[] };

/** The genres Discover offers, with their Apple Music genre ids. */
export const CHART_GENRES = [
  { label: 'All genres', id: undefined },
  { label: 'Pop', id: '14' },
  { label: 'Hip-Hop', id: '18' },
  { label: 'R&B', id: '15' },
  { label: 'Alternative', id: '20' },
  { label: 'Country', id: '6' },
  { label: 'Latin', id: '12' },
  { label: 'K-Pop', id: '51' },
  { label: 'Rock', id: '21' },
  { label: 'Dance', id: '17' },
] as const;

export function getCharts(genre?: string) {
  return request<ChartsResponse>(
    genre ? `/charts?genre=${encodeURIComponent(genre)}` : '/charts',
  );
}

/** A song on the AUX chart: everyone's rankings combined. */
export type CommunityEntry = {
  song: RankedSong['song'];
  listeners: number;
  averageScore: number;
};

export function getCommunityChart() {
  return request<{ entries: CommunityEntry[] }>('/charts/community');
}
