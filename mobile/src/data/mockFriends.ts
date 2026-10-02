import { catalog } from './mockMusic';
import type { Friend, FriendSuggestion } from './types';

export const friends: Friend[] = [
  {
    id: 'u-shyan',
    username: 'shyan',
    rankings: [
      { ...catalog[0], score: 8.7 },
      { ...catalog[5], score: 8.1 },
      { ...catalog[11], score: 7.4 },
      { ...catalog[2], score: 6.9 },
      { ...catalog[8], score: 5.5 },
    ].sort((a, b) => b.score - a.score),
  },
  {
    id: 'u-ariang',
    username: 'ariang',
    rankings: [
      { ...catalog[4], score: 9.0 },
      { ...catalog[6], score: 8.8 },
      { ...catalog[3], score: 8.3 },
      { ...catalog[9], score: 6.8 },
      { ...catalog[1], score: 6.2 },
    ].sort((a, b) => b.score - a.score),
  },
];

export const friendSuggestions: FriendSuggestion[] = [
  { id: 'u-jordan', username: 'jordan' },
  { id: 'u-maya', username: 'maya' },
  { id: 'u-devon', username: 'devon' },
];
