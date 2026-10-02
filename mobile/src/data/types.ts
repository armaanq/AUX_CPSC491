export interface Track {
  id: string;
  title: string;
  artist: string;
  albumTitle: string;
}

export interface RankedTrack extends Track {
  score: number;
}

export interface FeedActivity {
  id: string;
  username: string;
  track: Track;
  score: number;
}

export interface Friend {
  id: string;
  username: string;
  rankings: RankedTrack[];
}

export interface FriendSuggestion {
  id: string;
  username: string;
}

export interface GlobalRanking {
  track: Track;
  avgScore: number;
  logCount: number;
}
