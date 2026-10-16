import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  addFriend,
  getFriends,
  removeFriend,
  type FriendStatus,
  type FriendsResponse,
  type PublicUser,
} from '../api/users';
import { useUserId } from './AuthProvider';

type API = FriendsResponse & {
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Your status with this listener, as of the last load or change. */
  statusOf: (userId: string) => FriendStatus;
  /** Sends a request, or accepts theirs. Shows the change right away. */
  add: (user: PublicUser) => Promise<void>;
  /** Cancels, declines, or unfriends. Shows the change right away. */
  remove: (user: PublicUser) => Promise<void>;
};

const none: FriendsResponse = { friends: [], incoming: [], outgoing: [] };

const Context = createContext<API | null>(null);

/** Your friends and friend requests, loaded from the server for whoever is logged in. */
export function FriendsProvider({ children }: { children: React.ReactNode }) {
  const userId = useUserId();
  const [lists, setLists] = useState<FriendsResponse>(none);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Answers that arrive after logging out (or into another account) are dropped.
  const owner = useRef(userId);
  owner.current = userId;

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const next = await getFriends();
      if (owner.current !== userId) return;
      setLists(next);
      setError(null);
    } catch (err) {
      if (owner.current === userId)
        setError(`Couldn't load your friends. ${(err as Error).message}`);
    } finally {
      if (owner.current === userId) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setLists(none);
    setError(null);
    reload();
  }, [reload]);

  const statusOf = (id: string): FriendStatus =>
    lists.friends.some(u => u.id === id)
      ? 'friends'
      : lists.incoming.some(u => u.id === id)
      ? 'incoming'
      : lists.outgoing.some(u => u.id === id)
      ? 'outgoing'
      : 'none';

  /** Moves a user between lists to match a new status. */
  const place = (user: PublicUser, status: FriendStatus) =>
    setLists(current => {
      const without = (list: PublicUser[]) => list.filter(u => u.id !== user.id);
      const moved = { ...user, status };
      return {
        friends: [...without(current.friends), ...(status === 'friends' ? [moved] : [])].sort(
          (a, b) => a.username.localeCompare(b.username),
        ),
        incoming: [...without(current.incoming), ...(status === 'incoming' ? [moved] : [])],
        outgoing: [...without(current.outgoing), ...(status === 'outgoing' ? [moved] : [])],
      };
    });

  const change = async (
    user: PublicUser,
    guess: FriendStatus,
    send: (id: string) => Promise<{ status: FriendStatus }>,
  ) => {
    const before = statusOf(user.id);
    place(user, guess);
    try {
      place(user, (await send(user.id)).status);
      setError(null);
    } catch (err) {
      place(user, before);
      setError(`Couldn't update @${user.username}. ${(err as Error).message}`);
      throw err;
    }
  };

  return (
    <Context.Provider
      value={{
        ...lists,
        loading,
        error,
        reload,
        statusOf,
        add: user =>
          change(user, statusOf(user.id) === 'incoming' ? 'friends' : 'outgoing', addFriend),
        remove: user => change(user, 'none', removeFriend),
      }}
    >
      {children}
    </Context.Provider>
  );
}

const fallback: API = {
  ...none,
  loading: false,
  error: null,
  reload: async () => {},
  statusOf: () => 'none',
  add: async () => {},
  remove: async () => {},
};

/** Outside a FriendsProvider (some tests) you simply have no friends yet. */
export function useFriends() {
  return useContext(Context) ?? fallback;
}
