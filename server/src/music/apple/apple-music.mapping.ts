import { yearOf, type AlbumResult, type SearchResult } from '../catalog.js';
import { dedupeKey } from '../musicbrainz/mapping.js';
import type { AmAlbum, AmArtwork, AmSong } from './apple-music.types.js';

/** 600px covers a 230pt cover on a 3x iPhone screen without downloading the full 3000px original. */
const ARTWORK_PX = 600;

/** A song from Apple Music plus the album details needed to save it later. */
export interface MappedAppleSong {
  result: SearchResult;
  /** Apple's 30-second clip, if it has one. Kept out of SearchResult; the app asks GET /songs/preview. */
  previewUrl: string | null;
  album: {
    externalId: string;
    title: string;
    releaseYear: number | null;
    artworkUrl: string | null;
    externalUrl: string;
  } | null;
}

export function artworkUrl(artwork: AmArtwork | undefined): string | null {
  return artwork?.url ? artwork.url.replace('{w}', String(ARTWORK_PX)).replace('{h}', String(ARTWORK_PX)) : null;
}

/** The streamable 30-second clip. Only https URLs; the app plays whatever this returns. */
export function previewUrl(song: AmSong | undefined): string | null {
  const url = song?.attributes?.previews?.find(p => typeof p?.url === 'string')?.url;
  return url && url.startsWith('https://') ? url : null;
}

/** Apple lists "Music" as a genre on everything; the first real one is the useful one. */
export function mainGenre(genres: string[] | undefined): string | null {
  return genres?.find(g => g !== 'Music') ?? null;
}

/** A song's url is ".../album/<name>/<album id>?i=<song id>"; search results don't otherwise say which album. */
export function albumIdFromUrl(url: string): string | null {
  return /\/album\/[^/?]+\/(\d+)/.exec(url)?.[1] ?? null;
}

/** Null for anything without the fields AUX needs (Apple occasionally returns bare references). */
export function mapAppleSong(song: AmSong): MappedAppleSong | null {
  const a = song.attributes;
  if (!a?.name || !a.artistName || !a.url) return null;
  const albumId = albumIdFromUrl(a.url);
  const releaseYear = yearOf(a.releaseDate);
  return {
    previewUrl: previewUrl(song),
    result: {
      source: 'apple',
      externalId: song.id,
      title: a.name,
      artist: a.artistName,
      album: a.albumName ?? null,
      releaseYear,
      durationMs: typeof a.durationInMillis === 'number' ? a.durationInMillis : null,
      isrc: a.isrc ?? null,
      genre: mainGenre(a.genreNames),
      artworkUrl: artworkUrl(a.artwork),
      externalUrl: a.url,
      songId: null,
    },
    album:
      albumId && a.albumName
        ? {
            externalId: albumId,
            title: a.albumName,
            releaseYear,
            artworkUrl: artworkUrl(a.artwork),
            externalUrl: a.url.replace(/\?.*$/, ''),
          }
        : null,
  };
}

export function mapAppleAlbum(album: AmAlbum): AlbumResult | null {
  const a = album.attributes;
  if (!a?.name || !a.artistName || !a.url) return null;
  return {
    source: 'apple',
    externalId: album.id,
    title: a.name,
    artist: a.artistName,
    releaseYear: yearOf(a.releaseDate),
    trackCount: typeof a.trackCount === 'number' ? a.trackCount : null,
    genre: mainGenre(a.genreNames),
    artworkUrl: artworkUrl(a.artwork),
    externalUrl: a.url,
  };
}

/**
 * Apple lists the same recording once per release it's on (the single and the
 * album have different song ids but the same ISRC). Keep the first, which is
 * the more popular one since Apple orders results that way.
 */
export function dedupeAppleSongs(songs: AmSong[]): MappedAppleSong[] {
  const seen = new Set<string>();
  const out: MappedAppleSong[] = [];
  for (const song of songs) {
    const mapped = mapAppleSong(song);
    if (!mapped) continue;
    const keys = [dedupeKey(mapped.result.title, mapped.result.artist)];
    if (mapped.result.isrc) keys.push(`isrc:${mapped.result.isrc}`);
    if (keys.some(k => seen.has(k))) continue;
    keys.forEach(k => seen.add(k));
    out.push(mapped);
  }
  return out;
}
