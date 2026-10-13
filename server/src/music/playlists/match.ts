import type { SearchResult } from '../catalog.js';
import { tokenize } from '../musicbrainz/query.js';
import type { PlaylistEntry } from './spotify-embed.js';

/**
 * Title words that don't change which song it is. "Ivy - 2016 Remaster" and
 * "Ivy" are the same song for ranking purposes, but "Ivy (Live)" is a different
 * recording, so "live" is deliberately not in this list.
 */
const NOISE = new Set(['remaster', 'remastered', 'version', 'edit', 'radio', 'explicit', 'clean', 'mono', 'stereo']);

/** Lowercase words with feat./with credits, years, and remaster tags removed. */
export function titleWords(title: string): string[] {
  const base = title
    // "(feat. X)", "[with X]", "- feat. X" carry artists, not title words.
    .replace(/[([][^)\]]*\b(feat|ft|featuring|with)\b[^)\]]*[)\]]/gi, ' ')
    .replace(/\s-\s.*\b(feat|ft|featuring)\b.*$/i, ' ')
    .replace(/\b(feat|ft|featuring)\.?\s.*$/i, ' ');
  return tokenize(base).filter(w => !NOISE.has(w) && !/^(19|20)\d\d$/.test(w));
}

function artistWords(artist: string): Set<string> {
  return new Set(tokenize(artist.replace(/[,&]/g, ' ')).filter(w => w !== 'and' && w !== 'the'));
}

/**
 * The search result that is the playlist's song, or null if none is close
 * enough. A wrong match is worse than a miss: the user would rank a song they
 * never added, so this requires the same title words and at least one shared
 * artist word.
 */
export function pickMatch(entry: PlaylistEntry, candidates: SearchResult[]): SearchResult | null {
  const want = titleWords(entry.title).join(' ');
  if (!want) return null;
  const wantArtists = artistWords(entry.artist);
  let best: { result: SearchResult; score: number } | null = null;
  for (const result of candidates) {
    const got = titleWords(result.title).join(' ');
    if (got !== want) continue;
    const theirs = artistWords(result.artist);
    const shared = [...wantArtists].filter(w => theirs.has(w)).length;
    if (wantArtists.size && !shared) continue;
    // Prefer the original over a version that adds words (e.g. a remix credit).
    const score = shared * 10 - Math.abs(result.title.length - entry.title.length) / 100;
    if (!best || score > best.score) best = { result, score };
  }
  return best?.result ?? null;
}

/** The text to search the catalog with for one playlist song. */
export function searchTextFor(entry: PlaylistEntry): string {
  const firstArtist = entry.artist.split(/,|&/)[0]?.trim() ?? '';
  return `${titleWords(entry.title).join(' ')} ${firstArtist}`.trim();
}
