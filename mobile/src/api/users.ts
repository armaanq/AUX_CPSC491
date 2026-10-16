import { request } from './client';
import type { RankedSong } from './rankings';
import type { Sentiment } from '../data/prototype';

/** How you're connected to another listener, from your side. */
export type FriendStatus = 'self' | 'friends' | 'incoming' | 'outgoing' | 'none';

export type TasteMatch = {
  /** 0-100; null until you've both ranked at least 3 of the same songs. */
  score: number | null;
  /** Songs you've both ranked. */
  shared: number;
};

/** Another listener as anyone on AUX can see them. */
export type PublicUser = {
  id: string;
  username: string;
  bio: string;
  avatarUrl: string | null;
  createdAt: string;
  rankedCount: number;
  status: FriendStatus;
  taste: TasteMatch;
};

export type FriendsResponse = {
  friends: PublicUser[];
  /** Requests waiting for you to accept. */
  incoming: PublicUser[];
  /** Requests you sent that haven't been accepted. */
  outgoing: PublicUser[];
};

export type ProfileResponse = { user: PublicUser; rankings: RankedSong[] };

export type FriendScore = {
  user: { id: string; username: string };
  sentiment: Sentiment;
  score: number;
};

export function getFriends() {
  return request<FriendsResponse>('/friends');
}

/** Usernames containing `query`, closest first; the newest listeners when it's empty. */
export function searchUsers(query: string, signal?: AbortSignal) {
  const q = query.trim();
  return request<{ users: PublicUser[] }>(
    q ? `/users?q=${encodeURIComponent(q)}` : '/users',
    { signal },
  );
}

export function getProfile(userId: string) {
  return request<ProfileResponse>(`/users/${userId}`);
}

/** Sends a friend request, or accepts theirs. */
export function addFriend(userId: string) {
  return request<{ status: FriendStatus }>(`/friends/${userId}`, {
    method: 'POST',
  });
}

/** Cancels your request, declines theirs, or unfriends. */
export function removeFriend(userId: string) {
  return request<{ status: FriendStatus }>(`/friends/${userId}`, {
    method: 'DELETE',
  });
}

/** How your friends scored one song (by AUX song id), best first. */
export function getFriendScores(songId: string) {
  return request<{ scores: FriendScore[] }>(`/friends/songs/${songId}`);
}
