import {
  albumIdFromUrl,
  artworkUrl,
  dedupeAppleSongs,
  mainGenre,
  mapAppleAlbum,
  mapAppleSong,
} from './apple-music.mapping.js';
import {
  amBlonde,
  amIvy,
  amIvyOnCompilation,
  amNights,
  BLONDE_ID,
} from '../../../test/fixtures/apple-music.js';

describe('mapAppleSong', () => {
  it('produces the exact shape mobile/src/api/songs.ts expects', () => {
    const mapped = mapAppleSong(amIvy)!;
    expect(mapped.result).toEqual({
      source: 'apple',
      externalId: '1146195713',
      title: 'Ivy',
      artist: 'Frank Ocean',
      album: 'Blonde',
      releaseYear: 2016,
      durationMs: 249191,
      isrc: 'QZ5C81600002',
      genre: 'Pop',
      artworkUrl: expect.stringMatching(/\/600x600bb\.jpg$/),
      externalUrl: `https://music.apple.com/us/album/ivy/${BLONDE_ID}?i=1146195713`,
      songId: null,
    });
    expect(mapped.album).toEqual({
      externalId: BLONDE_ID,
      title: 'Blonde',
      releaseYear: 2016,
      artworkUrl: mapped.result.artworkUrl,
      externalUrl: `https://music.apple.com/us/album/ivy/${BLONDE_ID}`,
    });
  });

  it('skips resources without the fields AUX needs', () => {
    expect(mapAppleSong({ id: '1', type: 'songs' })).toBeNull();
  });
});

describe('mapAppleAlbum', () => {
  it('maps an album', () => {
    expect(mapAppleAlbum(amBlonde)).toEqual({
      source: 'apple',
      externalId: BLONDE_ID,
      title: 'Blonde',
      artist: 'Frank Ocean',
      releaseYear: 2016,
      trackCount: 17,
      genre: 'Pop',
      artworkUrl: expect.stringMatching(/\/600x600bb\.jpg$/),
      externalUrl: `https://music.apple.com/us/album/blonde/${BLONDE_ID}`,
    });
  });
});

describe('helpers', () => {
  it('fills in the artwork size and handles missing artwork', () => {
    expect(artworkUrl({ url: 'https://x/{w}x{h}bb.jpg' })).toBe('https://x/600x600bb.jpg');
    expect(artworkUrl(undefined)).toBeNull();
  });

  it('skips Apple’s catch-all "Music" genre', () => {
    expect(mainGenre(['Music', 'Hip-Hop/Rap'])).toBe('Hip-Hop/Rap');
    expect(mainGenre(['Music'])).toBeNull();
    expect(mainGenre(undefined)).toBeNull();
  });

  it('reads the album id from a song url', () => {
    expect(albumIdFromUrl('https://music.apple.com/us/album/ivy/1146195596?i=1146195713')).toBe('1146195596');
    expect(albumIdFromUrl('https://music.apple.com/us/song/ivy/1146195713')).toBeNull();
  });
});

describe('dedupeAppleSongs', () => {
  it('keeps the first copy of each recording, in Apple’s order', () => {
    const out = dedupeAppleSongs([amIvy, amNights, amIvyOnCompilation]);
    expect(out.map(m => m.result.externalId)).toEqual([amIvy.id, amNights.id]);
  });

  it('treats the same ISRC as the same recording even when the title differs', () => {
    const renamed = { ...amIvyOnCompilation, attributes: { ...amIvyOnCompilation.attributes!, name: 'Ivy (Radio Edit)' } };
    expect(dedupeAppleSongs([amIvy, renamed])).toHaveLength(1);
  });
});
