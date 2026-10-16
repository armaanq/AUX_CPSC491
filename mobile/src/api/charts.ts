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
  /** What the chart sorts by: the average, weighted by how many people ranked it. */
  chartScore: number;
};

/** Genre filters for the Hot 100. Keys match COMMUNITY_GENRES on the server. */
export const HOT100_GENRES = [
  { label: 'All', key: undefined },
  { label: 'Hip-Hop', key: 'hip-hop' },
  { label: 'R&B', key: 'rnb' },
  { label: 'Pop', key: 'pop' },
  { label: 'Alternative', key: 'alternative' },
  { label: 'Rock', key: 'rock' },
  { label: 'Latin', key: 'latin' },
  { label: 'Country', key: 'country' },
  { label: 'Dance', key: 'dance' },
  { label: 'K-Pop', key: 'k-pop' },
] as const;

/** The AUX chart, best average first. `limit` is 1-100 (server default 50). */
export function getCommunityChart(genre?: string, limit?: number) {
  const params = [
    genre && `genre=${encodeURIComponent(genre)}`,
    limit && `limit=${limit}`,
  ].filter(Boolean);
  return request<{ entries: CommunityEntry[] }>(
    `/charts/community${params.length ? `?${params.join('&')}` : ''}`,
  );
}

/** How everyone on AUX ranks a song. Songs nobody has ranked are left out. */
export type SongStats = {
  songId: string;
  listeners: number;
  averageScore: number;
};

/** At most 60 ids per call. */
export function getSongStats(songIds: string[]) {
  return request<{ stats: SongStats[] }>(
    `/charts/community/songs?ids=${songIds.map(encodeURIComponent).join(',')}`,
  );
}

/**
 * The Apple Music chart genre id for a song's genre name ("Hip-Hop/Rap" -> "18"),
 * so suggestions can pull the chart for genres you rank highly.
 */
export function chartGenreFor(genreName: string | undefined): string | undefined {
  const g = (genreName ?? '').toLowerCase();
  if (!g) return undefined;
  if (g.includes('k-pop')) return '51';
  if (g.includes('hip-hop') || g.includes('rap')) return '18';
  if (g.includes('r&b') || g.includes('soul')) return '15';
  if (g.includes('alternative') || g.includes('indie')) return '20';
  if (g.includes('country')) return '6';
  if (g.includes('latin') || g.includes('reggaeton') || g.includes('mexican')) return '12';
  if (g.includes('dance') || g.includes('electronic') || g.includes('house')) return '17';
  if (g.includes('rock') || g.includes('metal')) return '21';
  if (g.includes('pop')) return '14';
  return undefined;
}
