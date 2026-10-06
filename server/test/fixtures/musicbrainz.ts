import type { MbRecording } from '../../src/music/musicbrainz/musicbrainz.types.js';

// Shaped like real MusicBrainz ws/2 JSON (ids are made up but valid UUIDs).
export const IVY_ALBUM_RG = '11111111-1111-4111-8111-111111111111';

export const ivyOnBlonde: MbRecording = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  score: 100,
  title: 'Ivy',
  length: 249191,
  video: false,
  'first-release-date': '2016-08-20',
  'artist-credit': [{ name: 'Frank Ocean', joinphrase: '', artist: { id: 'x', name: 'Frank Ocean' } }],
  isrcs: ['USUM71607007'],
  releases: [
    {
      id: 'r-comp',
      title: 'Now That’s What I Call R&B',
      status: 'Official',
      date: '2017-01-01',
      'release-group': { id: 'rg-comp', title: 'Now R&B', 'primary-type': 'Album', 'secondary-types': ['Compilation'] },
    },
    {
      id: 'r-bootleg',
      title: 'Blonde (leak)',
      status: 'Bootleg',
      date: '2016-08-19',
      'release-group': { id: 'rg-boot', title: 'Blonde (leak)', 'primary-type': 'Album' },
    },
    {
      id: 'r-blonde-2',
      title: 'Blonde',
      status: 'Official',
      date: '2016-09-01',
      'release-group': { id: IVY_ALBUM_RG, title: 'Blonde', 'primary-type': 'Album' },
    },
    {
      id: 'r-blonde',
      title: 'Blonde',
      status: 'Official',
      date: '2016-08-20',
      'release-group': { id: IVY_ALBUM_RG, title: 'Blonde', 'primary-type': 'Album' },
    },
  ],
};

export const ivyMusicVideo: MbRecording = {
  ...ivyOnBlonde,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  score: 99,
  video: true,
};

export const ivyNoRelease: MbRecording = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  score: 98,
  title: 'Ivy',
  'artist-credit': [{ name: 'Frank Ocean' }],
};

export const ivyRemaster: MbRecording = {
  ...ivyOnBlonde,
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  score: 97,
  title: 'Ivy (Remastered 2021)',
};

export const ivyLive: MbRecording = {
  ...ivyOnBlonde,
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  score: 90,
  title: 'Ivy (live)',
};

export const collab: MbRecording = {
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  score: 85,
  title: 'Pink + White',
  length: null,
  'artist-credit': [
    { name: 'Frank Ocean', joinphrase: ' feat. ' },
    { name: 'Beyoncé', joinphrase: '' },
  ],
};

export const weakMatch: MbRecording = {
  id: '99999999-9999-4999-8999-999999999999',
  score: 12,
  title: 'Poison Ivy',
  'artist-credit': [{ name: 'The Coasters' }],
};

// The real result that exposed the ranking bug (real MusicBrainz ids).
export const ivyCover: MbRecording = {
  id: 'c95540db-cd0a-46c4-955f-a3521bd6c492',
  score: 100,
  title: 'Ivy (Frank Ocean Cover)',
  length: 252912,
  'artist-credit': [{ name: 'Car Seat Headrest' }],
  releases: [
    {
      id: 'r-covers',
      title: 'Covers',
      status: 'Official',
      date: '2016',
      'release-group': { id: 'f908a42a-1ebb-4dff-acd6-bd50a747173f', title: 'Covers', 'primary-type': 'Album' },
    },
  ],
};
