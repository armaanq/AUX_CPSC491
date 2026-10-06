import {
  artistName,
  coverArtUrl,
  dedupeKey,
  dedupeRecordings,
  mapRecording,
  isUnaskedVersion,
  pickRelease,
  yearOf,
} from './mapping.js';
import {
  collab,
  IVY_ALBUM_RG,
  ivyLive,
  ivyMusicVideo,
  ivyNoRelease,
  ivyOnBlonde,
  ivyCover,
  ivyRemaster,
  weakMatch,
} from '../../../test/fixtures/musicbrainz.js';

describe('mapRecording', () => {
  it('produces the exact shape mobile/src/api/songs.ts expects', () => {
    const { result, releaseGroup } = mapRecording(ivyOnBlonde);
    expect(result).toEqual({
      source: 'musicbrainz',
      externalId: ivyOnBlonde.id,
      title: 'Ivy',
      artist: 'Frank Ocean',
      album: 'Blonde',
      releaseYear: 2016,
      durationMs: 249191,
      isrc: 'USUM71607007',
      artworkUrl: coverArtUrl(IVY_ALBUM_RG),
      externalUrl: `https://musicbrainz.org/recording/${ivyOnBlonde.id}`,
      songId: null,
    });
    expect(releaseGroup).toEqual({
      id: IVY_ALBUM_RG,
      title: 'Blonde',
      releaseYear: 2016,
      artworkUrl: coverArtUrl(IVY_ALBUM_RG),
      externalUrl: `https://musicbrainz.org/release-group/${IVY_ALBUM_RG}`,
    });
  });

  it('handles a recording with no releases, length or ISRC', () => {
    const { result, releaseGroup } = mapRecording(ivyNoRelease);
    expect(result.album).toBeNull();
    expect(result.artworkUrl).toBeNull();
    expect(result.durationMs).toBeNull();
    expect(result.isrc).toBeNull();
    expect(result.releaseYear).toBeNull();
    expect(releaseGroup).toBeNull();
  });
});

describe('pickRelease', () => {
  it('prefers the earliest official studio album over compilations and bootlegs', () => {
    expect(pickRelease(ivyOnBlonde.releases)?.id).toBe('r-blonde');
  });

  it('prefers an album over a single, and a single over nothing', () => {
    const single = { id: 's', title: 'S', status: 'Official', date: '2000', 'release-group': { id: 'a', 'primary-type': 'Single' } };
    const album = { id: 'al', title: 'A', status: 'Official', date: '2005', 'release-group': { id: 'b', 'primary-type': 'Album' } };
    expect(pickRelease([single, album])?.id).toBe('al');
    expect(pickRelease([single])?.id).toBe('s');
    expect(pickRelease([])).toBeNull();
  });
});

describe('artistName / yearOf', () => {
  it('joins collaborators with their join phrases', () => {
    expect(artistName(collab['artist-credit'])).toBe('Frank Ocean feat. Beyoncé');
    expect(artistName(undefined)).toBe('Unknown artist');
  });

  it('reads the year from full, partial, or missing dates', () => {
    expect(yearOf('2016-08-20')).toBe(2016);
    expect(yearOf('1999')).toBe(1999);
    expect(yearOf('')).toBeNull();
    expect(yearOf(undefined)).toBeNull();
  });
});

describe('dedupeKey', () => {
  it('treats remasters as the same song but keeps live/remix versions apart', () => {
    const base = dedupeKey('Ivy', 'Frank Ocean');
    expect(dedupeKey('Ivy (Remastered 2021)', 'Frank Ocean')).toBe(base);
    expect(dedupeKey('Ivy - 2011 Remaster', 'Frank Ocean')).toBe(base);
    expect(dedupeKey('Ivy [Remastered]', 'frank ocean')).toBe(base);
    expect(dedupeKey('Ivy (Live)', 'Frank Ocean')).not.toBe(base);
    expect(dedupeKey('Ivy (Remix)', 'Frank Ocean')).not.toBe(base);
  });
});

describe('isUnaskedVersion', () => {
  it('flags covers, karaoke and tributes unless the search asked for them', () => {
    expect(isUnaskedVersion('Ivy (Frank Ocean Cover)', 'ivy frank ocean')).toBe(true);
    expect(isUnaskedVersion('Ivy (Frank Ocean Cover)', 'ivy cover')).toBe(false);
    expect(isUnaskedVersion('Ivy (Karaoke Version)', 'ivy')).toBe(true);
    expect(isUnaskedVersion('Ivy', 'ivy')).toBe(false);
  });
});

describe('dedupeRecordings', () => {
  const all = [ivyNoRelease, ivyOnBlonde, ivyMusicVideo, ivyRemaster, ivyLive, collab, weakMatch];

  it('collapses duplicates, drops videos, keeps result order', () => {
    const out = dedupeRecordings(all, 10).map(m => m.result.title);
    expect(out).toEqual(['Ivy', 'Ivy (live)', 'Pink + White', 'Poison Ivy']);
  });

  it('keeps low-scored results (scores are relative to the top hit)', () => {
    expect(dedupeRecordings([ivyCover, weakMatch], 10, 'ivy')).toHaveLength(2);
  });

  it('puts the original above a cover that MusicBrainz ranked first', () => {
    // The real bug: "ivy frank ocean" returned only Car Seat Headrest's cover.
    const out = dedupeRecordings([ivyCover, ivyOnBlonde], 10, 'ivy frank ocean');
    expect(out.map(m => m.result.artist)).toEqual(['Frank Ocean', 'Car Seat Headrest']);
  });

  it('keeps a cover first when the search asks for covers', () => {
    const out = dedupeRecordings([ivyCover, ivyOnBlonde], 10, 'ivy cover');
    expect(out[0].result.artist).toBe('Car Seat Headrest');
  });

  it('keeps the copy of a duplicate that is on an actual release', () => {
    const [ivy] = dedupeRecordings(all, 10);
    expect(ivy.result.externalId).toBe(ivyOnBlonde.id);
    expect(ivy.result.album).toBe('Blonde');
  });

  it('stops at the max', () => {
    expect(dedupeRecordings(all, 1)).toHaveLength(1);
  });
});
