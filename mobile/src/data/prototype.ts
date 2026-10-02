import { catalog as tracks, myRankings } from './mockMusic';
import artwork from './artwork.json';
import { friends } from './mockFriends';
import type { CatalogSource, SearchResult } from '../api/songs';
export type MusicKind = 'song' | 'album';
export type Music = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  kind: MusicKind;
  albumTitle: string;
  artwork?: string;
  // Set for real songs from the catalog (MusicBrainz/Spotify), not demo data.
  source?: CatalogSource;
  externalId?: string;
  externalUrl?: string;
};
// Reaction-first scoring. The user's first reaction picks a band, comparisons
// place the song inside it, and every song in that band is re-spread so scores
// adjust. Keep these numbers in sync with server/src/rankings/scoring.ts.
export type Sentiment = 'LOVED' | 'FINE' | 'DISLIKED';
export const SENTIMENT_ORDER: readonly Sentiment[] = [
  'LOVED',
  'FINE',
  'DISLIKED',
];
export const SENTIMENT_BANDS: Record<Sentiment, { max: number; min: number }> =
  {
    LOVED: { max: 10, min: 6.67 },
    FINE: { max: 6.66, min: 3.34 },
    DISLIKED: { max: 3.33, min: 0 },
  };
export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  LOVED: 'Loved it',
  FINE: 'It was fine',
  DISLIKED: 'Didn’t like it',
};
export function scoreFor(
  sentiment: Sentiment,
  indexInBand: number,
  bandSize: number,
): number {
  const { max, min } = SENTIMENT_BANDS[sentiment];
  return Math.round((max - ((max - min) * indexInBand) / bandSize) * 100) / 100;
}
// Songs only: albums can be browsed but not ranked.
export type Ranking = { musicId: string; sentiment: Sentiment; score: number };
/** Rewrites every score from list order. Input must be ordered best-first. */
export function rescore(ordered: Ranking[]): Ranking[] {
  return SENTIMENT_ORDER.flatMap(sentiment => {
    const band = ordered.filter(r => r.sentiment === sentiment);
    return band.map((r, i) => ({
      ...r,
      score: scoreFor(sentiment, i, band.length),
    }));
  });
}
// Turns the hand-written sample scores into reaction-first rankings.
function fromSampleScores(list: { musicId: string; score: number }[]) {
  return rescore(
    [...list]
      .sort((a, b) => b.score - a.score)
      .map(r => ({
        musicId: r.musicId,
        score: r.score,
        sentiment: (r.score >= SENTIMENT_BANDS.LOVED.min
          ? 'LOVED'
          : r.score >= SENTIMENT_BANDS.FINE.min
          ? 'FINE'
          : 'DISLIKED') as Sentiment,
      })),
  );
}
export type Person = {
  id: string;
  name: string;
  bio: string;
  genres: string[];
  rankings: Ranking[];
};
const genres = [
  'Pop',
  'Soul',
  'Hip-hop',
  'R&B',
  'R&B',
  'Hip-hop',
  'R&B',
  'R&B',
  'Hip-hop',
  'R&B',
  'R&B',
  'Soul',
];
export const music: Music[] = tracks.map((t, i) => ({
  ...t,
  kind: 'song',
  genre: genres[i],
}));
Array.from(new Set(tracks.map(t => t.albumTitle))).forEach((title, i) => {
  const track = music.find(t => t.albumTitle === title)!;
  music.push({ ...track, id: `a${i}`, title, kind: 'album' });
});
music
  .filter(m => m.kind === 'album')
  .forEach(album => {
    album.artwork = (artwork as Record<string, string>)[album.id];
    music
      .filter(m => m.kind === 'song' && m.albumTitle === album.title)
      .forEach(track => {
        track.artwork = album.artwork;
      });
  });
export const findMusic = (id: string) => music.find(m => m.id === id)!;
/** App id for a catalog song, e.g. "mb:<mbid>" or "sp:<spotify id>". */
export const catalogId = (source: CatalogSource, externalId: string) =>
  `${source === 'spotify' ? 'sp' : 'mb'}:${externalId}`;
export function musicFromSearch(r: SearchResult): Music {
  return {
    id: catalogId(r.source, r.externalId),
    title: r.title,
    artist: r.artist,
    genre: 'Other', // catalogs don't send a genre with search results
    kind: 'song',
    albumTitle: r.album ?? '',
    artwork: r.artworkUrl ?? undefined,
    source: r.source,
    externalId: r.externalId,
    externalUrl: r.externalUrl,
  };
}
/** Makes catalog songs findable by id (detail page, rankings, charts). */
export function registerMusic(items: Music[]) {
  items.forEach(item => {
    if (!music.some(m => m.id === item.id)) music.push(item);
  });
}
export function isCatalogMusic(value: unknown): value is Music {
  const m = value as Music;
  return (
    !!m &&
    typeof m.id === 'string' &&
    /^(mb|sp):/.test(m.id) &&
    typeof m.title === 'string' &&
    typeof m.artist === 'string' &&
    m.kind === 'song' &&
    (m.source === 'musicbrainz' || m.source === 'spotify') &&
    typeof m.externalId === 'string'
  );
}
export const people: Person[] = [
  ...friends.map(f => ({
    id: f.id,
    name: f.username,
    bio:
      f.username === 'shyan'
        ? 'Always looking for the next no-skip album.'
        : 'Late-night listening. Strong opinions.',
    genres: ['R&B', 'Hip-hop'],
    rankings: fromSampleScores(
      f.rankings.map(t => ({ musicId: t.id, score: t.score })),
    ),
  })),
  {
    id: 'u-maya',
    name: 'maya',
    bio: 'Soul records and Sunday mornings.',
    genres: ['Soul', 'R&B'],
    rankings: fromSampleScores([
      { musicId: 't2', score: 9.4 },
      { musicId: 't12', score: 9.1 },
      { musicId: 't4', score: 8.8 },
    ]),
  },
  {
    id: 'u-jordan',
    name: 'jordan',
    bio: 'One more album before bed.',
    genres: ['Pop', 'Hip-hop'],
    rankings: fromSampleScores([
      { musicId: 't1', score: 9.3 },
      { musicId: 't6', score: 8.2 },
    ]),
  },
  {
    id: 'u-devon',
    name: 'devon',
    bio: 'Here for the deep cuts.',
    genres: ['R&B', 'Soul'],
    rankings: fromSampleScores([
      { musicId: 't7', score: 9.8 },
      { musicId: 't11', score: 9.2 },
    ]),
  },
];
export const initialRankings: Ranking[] = fromSampleScores(
  myRankings.map(t => ({ musicId: t.id, score: t.score })),
);
export function tasteMatch(a: Ranking[], b: Ranking[]) {
  const shared = a.filter(r => b.some(other => other.musicId === r.musicId));
  if (shared.length < 3) return { score: null, count: shared.length };
  const gap =
    shared.reduce(
      (sum, r) =>
        sum +
        Math.abs(r.score - b.find(other => other.musicId === r.musicId)!.score),
      0,
    ) / shared.length;
  return { score: Math.round(100 * (1 - gap / 10)), count: shared.length };
}
/** The user's songs in one band, best first, optionally leaving one song out. */
export function bandOf(
  rankings: Ranking[],
  sentiment: Sentiment,
  excludeId?: string,
): Ranking[] {
  return rankings.filter(
    r => r.sentiment === sentiment && r.musicId !== excludeId,
  );
}
/**
 * Places a song at `index` inside its band (moving it if already ranked) and
 * rescores the whole list. Albums are ignored: only songs can be ranked.
 * `rankings` must already be ordered best-first (state always is).
 */
export function insertRanking(
  rankings: Ranking[],
  musicId: string,
  sentiment: Sentiment,
  index: number,
): Ranking[] {
  if (findMusic(musicId)?.kind !== 'song') return rankings;
  const others = rankings.filter(r => r.musicId !== musicId);
  const band = bandOf(others, sentiment);
  const position = Math.max(0, Math.min(index, band.length));
  band.splice(position, 0, { musicId, sentiment, score: 0 });
  return rescore(
    SENTIMENT_ORDER.flatMap(s => (s === sentiment ? band : bandOf(others, s))),
  );
}
