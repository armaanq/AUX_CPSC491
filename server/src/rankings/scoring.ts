import type { Sentiment } from '../generated/prisma/client.js';

// Reaction-first scoring. Keep these numbers and rules in sync with
// mobile/src/data/prototype.ts (SENTIMENT_BANDS, scoreFor, rescore, insertRanking).
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

export function scoreFor(
  sentiment: Sentiment,
  indexInBand: number,
  bandSize: number,
): number {
  const { max, min } = SENTIMENT_BANDS[sentiment];
  return Math.round((max - ((max - min) * indexInBand) / bandSize) * 100) / 100;
}

export interface Placement {
  songId: string;
  sentiment: Sentiment;
  /** 0-based spot inside the sentiment band; 0 is the best. */
  position: number;
  score: number;
}

/** Orders a user's rankings best-first: by band, then by position inside the band. */
export function bestFirst<T extends { sentiment: Sentiment; position: number }>(
  entries: T[],
): T[] {
  return [...entries].sort(
    (a, b) =>
      SENTIMENT_ORDER.indexOf(a.sentiment) -
        SENTIMENT_ORDER.indexOf(b.sentiment) || a.position - b.position,
  );
}

/** Renumbers positions and re-spreads scores in every band, keeping the given order. */
export function rescore(
  ordered: { songId: string; sentiment: Sentiment }[],
): Placement[] {
  return SENTIMENT_ORDER.flatMap((sentiment) => {
    const band = ordered.filter((e) => e.sentiment === sentiment);
    return band.map((e, i) => ({
      songId: e.songId,
      sentiment,
      position: i,
      score: scoreFor(sentiment, i, band.length),
    }));
  });
}

/**
 * The full list after putting `songId` at `position` inside its band (moving it
 * if it's already ranked). `position` is counted without the song itself and is
 * clamped to the band, so "past the end" means last.
 */
export function place(
  current: Placement[],
  songId: string,
  sentiment: Sentiment,
  position: number,
): Placement[] {
  const others = bestFirst(current).filter((e) => e.songId !== songId);
  const band = others.filter((e) => e.sentiment === sentiment);
  const at = Math.max(0, Math.min(position, band.length));
  band.splice(at, 0, { songId, sentiment, position: at, score: 0 });
  return rescore(
    SENTIMENT_ORDER.flatMap((s) =>
      s === sentiment ? band : others.filter((e) => e.sentiment === s),
    ),
  );
}

export function remove(current: Placement[], songId: string): Placement[] {
  return rescore(bestFirst(current).filter((e) => e.songId !== songId));
}
