import type { FeedActivity, RankedTrack, Track } from './types';

export const catalog: Track[] = [
  { id: 't1', title: 'Blinding Lights', artist: 'The Weeknd', albumTitle: 'After Hours' },
  { id: 't2', title: 'Redbone', artist: 'Childish Gambino', albumTitle: 'Awaken, My Love!' },
  { id: 't3', title: 'No Role Modelz', artist: 'J. Cole', albumTitle: '2014 Forest Hills Drive' },
  { id: 't4', title: 'Nights', artist: 'Frank Ocean', albumTitle: 'Blonde' },
  { id: 't5', title: 'Novacane', artist: 'Frank Ocean', albumTitle: 'Nostalgia, Ultra' },
  { id: 't6', title: 'Sicko Mode', artist: 'Travis Scott', albumTitle: 'Astroworld' },
  { id: 't7', title: 'Ivy', artist: 'Frank Ocean', albumTitle: 'Blonde' },
  { id: 't8', title: 'Location', artist: 'Khalid', albumTitle: 'American Teen' },
  { id: 't9', title: 'Feel No Ways', artist: 'Drake', albumTitle: 'Views' },
  { id: 't10', title: 'Passionfruit', artist: 'Drake', albumTitle: 'More Life' },
  { id: 't11', title: 'Self Control', artist: 'Frank Ocean', albumTitle: 'Blonde' },
  { id: 't12', title: 'Best Part', artist: 'Daniel Caesar', albumTitle: 'Freudian' },
];

export const myRankings: RankedTrack[] = [
  { ...catalog[6], score: 9.4 },
  { ...catalog[3], score: 9.1 },
  { ...catalog[1], score: 8.6 },
  { ...catalog[10], score: 8.2 },
  { ...catalog[5], score: 7.8 },
  { ...catalog[7], score: 7.1 },
  { ...catalog[2], score: 6.5 },
  { ...catalog[9], score: 5.9 },
  { ...catalog[8], score: 4.3 },
].sort((a, b) => b.score - a.score);

export const feed: FeedActivity[] = [
  { id: 'f1', username: 'shyan', track: catalog[0], score: 8.7 },
  { id: 'f2', username: 'ariang', track: catalog[4], score: 9.0 },
  { id: 'f3', username: 'shyan', track: catalog[11], score: 7.4 },
  { id: 'f4', username: 'ariang', track: catalog[9], score: 6.8 },
  { id: 'f5', username: 'you', track: catalog[6], score: 9.4 },
];
