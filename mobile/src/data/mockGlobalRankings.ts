import { catalog } from './mockMusic';
import type { GlobalRanking } from './types';

export const globalRankings: GlobalRanking[] = [
  { track: catalog[6], avgScore: 9.2, logCount: 184 },
  { track: catalog[3], avgScore: 9.0, logCount: 231 },
  { track: catalog[0], avgScore: 8.8, logCount: 312 },
  { track: catalog[5], avgScore: 8.6, logCount: 276 },
  { track: catalog[10], avgScore: 8.4, logCount: 198 },
  { track: catalog[1], avgScore: 8.1, logCount: 152 },
  { track: catalog[9], avgScore: 7.9, logCount: 143 },
  { track: catalog[11], avgScore: 7.6, logCount: 121 },
  { track: catalog[7], avgScore: 7.3, logCount: 98 },
  { track: catalog[2], avgScore: 7.0, logCount: 87 },
].sort((a, b) => b.avgScore - a.avgScore);
