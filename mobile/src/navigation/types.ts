import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Hot100: undefined;
  /** `query` pre-fills the search (e.g. a playlist song AUX couldn't match). */
  Discover: { query?: string } | undefined;
  Rank: undefined;
  Library: undefined;
  Add: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  /** First-run setup for a new account: import a playlist. */
  Onboarding: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  Compare: { musicId: string };
  MusicDetail: { musicId: string };
  FriendProfile: { userId: string };
  Profile: undefined;
};
