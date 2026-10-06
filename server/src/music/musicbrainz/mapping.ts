import type { MbArtistCredit, MbRecording, MbRelease } from './musicbrainz.types.js';

/** A song as GET /songs/search returns it. Mirrors mobile/src/api/songs.ts. */
export interface SearchResult {
  source: 'musicbrainz' | 'spotify';
  externalId: string;
  title: string;
  artist: string;
  album: string | null;
  releaseYear: number | null;
  durationMs: number | null;
  isrc: string | null;
  artworkUrl: string | null;
  externalUrl: string;
  /** AUX song id if someone already ranked/saved it. */
  songId: string | null;
}

/** A search result plus the album details needed to save it later. */
export interface MappedRecording {
  result: SearchResult;
  releaseGroup: {
    id: string;
    title: string;
    releaseYear: number | null;
    artworkUrl: string;
    externalUrl: string;
  } | null;
}

export const coverArtUrl = (releaseGroupId: string) =>
  // Redirects to the image. 404s when nobody has uploaded art; the app's
  // artwork component already falls back to a colored tile when loading fails.
  `https://coverartarchive.org/release-group/${releaseGroupId}/front-250`;

export function artistName(credits: MbArtistCredit[] | undefined): string {
  if (!credits?.length) return 'Unknown artist';
  return credits.map(c => `${c.name}${c.joinphrase ?? ''}`).join('').trim();
}

export function yearOf(date: string | undefined | null): number | null {
  const year = Number(date?.slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : null;
}

const UNWANTED = new Set(['Compilation', 'Live', 'DJ-mix', 'Mixtape/Street', 'Remix', 'Karaoke']);

function releaseRank(r: MbRelease): number {
  const rg = r['release-group'];
  const type = rg?.['primary-type'];
  let rank = 0;
  if (r.status && r.status !== 'Official') rank += 100; // bootlegs, promos
  if (rg?.['secondary-types']?.some(t => UNWANTED.has(t))) rank += 50;
  if (type === 'Album') rank += 0;
  else if (type === 'EP') rank += 5;
  else if (type === 'Single') rank += 10;
  else rank += 20;
  return rank;
}

/**
 * The release a song "belongs to" for display: an official studio album if
 * there is one, then EP, then single; ties go to the earliest release.
 * Search results show a hit on a 2004 "Greatest Hits" otherwise.
 */
export function pickRelease(releases: MbRelease[] | undefined): MbRelease | null {
  if (!releases?.length) return null;
  return [...releases].sort((a, b) => {
    const byRank = releaseRank(a) - releaseRank(b);
    if (byRank) return byRank;
    return (a.date || '9999').localeCompare(b.date || '9999');
  })[0];
}

export function mapRecording(rec: MbRecording): MappedRecording {
  const release = pickRelease(rec.releases);
  const rg = release?.['release-group'];
  const artist = artistName(rec['artist-credit']);
  const releaseYear = yearOf(rec['first-release-date']) ?? yearOf(release?.date);
  return {
    result: {
      source: 'musicbrainz',
      externalId: rec.id,
      title: rec.title,
      artist,
      album: release?.title ?? null,
      releaseYear,
      durationMs: typeof rec.length === 'number' ? rec.length : null,
      isrc: rec.isrcs?.[0] ?? null,
      artworkUrl: rg ? coverArtUrl(rg.id) : null,
      externalUrl: `https://musicbrainz.org/recording/${rec.id}`,
      songId: null,
    },
    releaseGroup: rg
      ? {
          id: rg.id,
          title: rg.title || release!.title,
          releaseYear: yearOf(release?.date),
          artworkUrl: coverArtUrl(rg.id),
          externalUrl: `https://musicbrainz.org/release-group/${rg.id}`,
        }
      : null,
  };
}

// "Song (Remastered 2011)" and "Song - 2011 Remaster" are the same song to a
// listener. Remixes, live and acoustic versions are kept as different songs.
const REMASTER = /\s*(?:[([]\s*)?(?:-\s*)?(?:\d{4}\s+)?remaster(?:ed)?(?:\s+(?:version|\d{4}))?\s*[)\]]?\s*$/i;

export function dedupeKey(title: string, artist: string): string {
  const clean = (s: string) =>
    s
      .replace(REMASTER, '')
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return `${clean(title)}|${clean(artist)}`;
}

// Versions of someone else's song. Shown after originals unless the search asks for them.
const NOT_ORIGINAL = ['cover', 'karaoke', 'tribute', 'instrumental', 'made famous', 'originally performed'];

/** True when the title marks this as a cover/karaoke/tribute the user didn't ask for. */
export function isUnaskedVersion(title: string, query: string): boolean {
  const t = title.toLowerCase();
  const q = query.toLowerCase();
  return NOT_ORIGINAL.some(word => t.includes(word) && !q.includes(word));
}

/**
 * MusicBrainz has one recording per distinct audio, so a popular song shows up
 * many times (album, single, radio edit, remaster, music video). Keep the
 * first (best ranked) of each title+artist and skip music videos. Covers,
 * karaoke and tribute versions move below originals. Capped at `max`.
 *
 * There is deliberately no minimum score: MusicBrainz scores are relative to
 * the top hit, so one unusually strong match would push good results under any
 * fixed cutoff. The query already requires every word, which keeps out junk.
 */
export function dedupeRecordings(recs: MbRecording[], max: number, query = ''): MappedRecording[] {
  const seen = new Map<string, MappedRecording>();
  for (const rec of recs) {
    if (rec.video) continue;
    const mapped = mapRecording(rec);
    const key = dedupeKey(mapped.result.title, mapped.result.artist);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, mapped);
    } else if (!existing.result.album && mapped.result.album) {
      // Same song, but this copy is on an actual release: prefer it.
      seen.set(key, mapped);
    }
  }
  const all = [...seen.values()];
  const originals = all.filter(m => !isUnaskedVersion(m.result.title, query));
  const versions = all.filter(m => isUnaskedVersion(m.result.title, query));
  return [...originals, ...versions].slice(0, max);
}
