// Trimmed Apple Music API resources, shaped like real responses (Blonde, 2016).
import type { AmAlbum, AmSong } from '../../src/music/apple/apple-music.types.js';

export const BLONDE_ID = '1146195596';
const ART = 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/bb/45/68/BlondCover-Final.jpg/{w}x{h}bb.jpg';

function song(id: string, name: string, isrc: string, extra: Partial<NonNullable<AmSong['attributes']>> = {}): AmSong {
  return {
    id,
    type: 'songs',
    attributes: {
      name,
      artistName: 'Frank Ocean',
      albumName: 'Blonde',
      releaseDate: '2016-08-20',
      durationInMillis: 249191,
      isrc,
      genreNames: ['Pop', 'Music'],
      artwork: { url: ART, width: 1500, height: 1500 },
      url: `https://music.apple.com/us/album/${name.toLowerCase()}/${BLONDE_ID}?i=${id}`,
      ...extra,
    },
  };
}

export const amIvy = song('1146195713', 'Ivy', 'QZ5C81600002');
export const amNikes = song('1146195712', 'Nikes', 'QZ5C81600001');
export const amNights = song('1146195720', 'Nights', 'QZ5C81600009');
/** The same recording as amIvy on another release (same ISRC, different Apple id). */
export const amIvyOnCompilation = song('1500000001', 'Ivy', 'QZ5C81600002', {
  albumName: 'Summer Hits 2016',
  url: 'https://music.apple.com/us/album/ivy/1500000000?i=1500000001',
});

export const amBlonde: AmAlbum = {
  id: BLONDE_ID,
  type: 'albums',
  attributes: {
    name: 'Blonde',
    artistName: 'Frank Ocean',
    releaseDate: '2016-08-20',
    trackCount: 17,
    genreNames: ['Pop', 'Music', 'R&B/Soul'],
    artwork: { url: ART, width: 1500, height: 1500 },
    url: `https://music.apple.com/us/album/blonde/${BLONDE_ID}`,
  },
};

/** Blonde as GET /albums/{id} returns it: with its tracklist, which can include music videos. */
export const amBlondeWithTracks: AmAlbum = {
  ...amBlonde,
  relationships: {
    tracks: {
      data: [amNikes, amIvy, { id: '1146195799', type: 'music-videos' }],
    },
  },
};
