import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { getProfile, type FriendStatus, type ProfileResponse } from '../api/users';
import { findMusic, musicFromSearch, registerMusic, type Music } from '../data/prototype';
import { useFriends } from '../state/FriendsProvider';
import { useRankings } from '../state/RankingsProvider';
import { Avatar } from '../components/Avatar';
import { Button, Empty, MusicRow, Page, palette, scoreTone, ui } from '../components/Kit';
import { tally } from './ProfileScreen';

/** How many of their rankings show before "Show all". */
const PREVIEW = 20;

type Loaded = {
  profile: ProfileResponse;
  /** Their rankings as app music, best first. */
  ranked: { item: Music; score: number }[];
};

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | ({ status: 'done' } & Loaded);

/** Another listener's profile: who they are, your taste match, and their rankings. */
export function FriendProfileScreen({
  route,
}: NativeStackScreenProps<RootStackParamList, 'FriendProfile'>) {
  const { userId } = route.params;
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const friends = useFriends();
  const { rankings: mine } = useRankings();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [showAll, setShowAll] = useState(false);
  // After you add or remove them here, the friends list is the source of truth.
  const [touched, setTouched] = useState(false);

  const fetchProfile = useCallback(() => {
    let active = true;
    setLoad({ status: 'loading' });
    getProfile(userId)
      .then(profile => {
        const items = profile.rankings.map(r =>
          musicFromSearch({ ...r.song, songId: r.song.id }),
        );
        registerMusic(items);
        if (active)
          setLoad({
            status: 'done',
            profile,
            ranked: profile.rankings.map((r, i) => ({ item: findMusic(items[i].id), score: r.score })),
          });
      })
      .catch((err: Error) => {
        if (active) setLoad({ status: 'error', error: err.message });
      });
    return () => {
      active = false;
    };
  }, [userId]);
  useEffect(fetchProfile, [fetchProfile]);

  if (load.status === 'loading')
    return (
      <Page insetTop={false}>
        <ActivityIndicator color={palette.ink} />
        <Text style={[ui.body, { textAlign: 'center' }]}>Loading their profile…</Text>
      </Page>
    );
  if (load.status === 'error')
    return (
      <Page insetTop={false}>
        <Empty title="Couldn’t load this profile" body={load.error} />
        <Button title="Try again" onPress={fetchProfile} />
      </Page>
    );

  const { user } = load.profile;
  const live = friends.statusOf(user.id);
  const status: FriendStatus =
    user.status === 'self' ? 'self' : live !== 'none' || touched ? live : user.status;
  const act = (change: Promise<void>) => {
    setTouched(true);
    // A failure shows up in the friends drawer; the button puts itself back.
    change.catch(() => {});
  };
  const confirmRemove = () =>
    Alert.alert('Remove friend?', `Remove @${user.username} from your friends?`, [
      { text: 'Keep friend', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => act(friends.remove(user)) },
    ]);

  // Songs you've both ranked: your score next to theirs.
  const myScore = new Map(
    mine.flatMap(r => {
      const songId = findMusic(r.musicId)?.songId;
      return songId ? [[songId, r.score] as const] : [];
    }),
  );
  const shared = load.ranked
    .flatMap(r => {
      const yours = r.item.songId ? myScore.get(r.item.songId) : undefined;
      return yours === undefined ? [] : [{ ...r, yours }];
    })
    .slice(0, 5);
  const genres = tally(load.ranked.map(r => r.item.genre).filter(g => g && g !== 'Other'), 3);
  const since = new Date(user.createdAt).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const open = (musicId: string) => nav.navigate('MusicDetail', { musicId });
  const visible = showAll ? load.ranked : load.ranked.slice(0, PREVIEW);

  return (
    <Page insetTop={false}>
      <View style={ui.row}>
        <Avatar avatarUrl={user.avatarUrl} seed={user.id} name={user.username} size={76} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[ui.title, { fontSize: 28 }]} numberOfLines={1}>
            @{user.username}
          </Text>
          <Text style={ui.body}>
            {user.rankedCount} ranked · on AUX since {since}
          </Text>
        </View>
      </View>
      {!!user.bio && <Text style={ui.body}>{user.bio}</Text>}

      {status === 'none' && (
        <Button title="Add friend" onPress={() => act(friends.add(user))} />
      )}
      {status === 'outgoing' && (
        <Button
          secondary
          title="Request sent · Cancel"
          onPress={() => act(friends.remove(user))}
        />
      )}
      {status === 'incoming' && (
        <>
          <Button title="Accept friend request" onPress={() => act(friends.add(user))} />
          <Button secondary title="Decline" onPress={() => act(friends.remove(user))} />
        </>
      )}
      {status === 'friends' && <Button secondary title="✓ Friends" onPress={confirmRemove} />}

      {status !== 'self' && (
        <View style={[ui.card, { backgroundColor: '#E8EDE5', borderColor: '#E8EDE5' }]}>
          <Text style={ui.label}>YOUR TASTE, SIDE BY SIDE</Text>
          <Text
            style={[
              ui.title,
              {
                fontSize: 30,
                color: user.taste.score === null ? palette.muted : scoreTone(user.taste.score / 10),
              },
            ]}
          >
            {user.taste.score === null ? 'Still getting to know you' : `${user.taste.score}% in tune`}
          </Text>
          <Text style={ui.body}>
            {user.taste.score === null
              ? `You’ve both ranked ${user.taste.shared} of the same ${
                  user.taste.shared === 1 ? 'song' : 'songs'
                }. Rank at least 3 in common to see a match.`
              : `Based on the ${user.taste.shared} songs you’ve both ranked. 100% means your scores agree exactly.`}
          </Text>
          {shared.map(s => (
            <Pressable
              key={s.item.id}
              accessibilityRole="button"
              onPress={() => open(s.item.id)}
              style={ui.between}
            >
              <Text style={[ui.musicTitle, { flex: 1 }]} numberOfLines={1}>
                {s.item.title}
              </Text>
              <Text style={ui.body}>
                You {s.yours.toFixed(2)} · Them {s.score.toFixed(2)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {genres.length > 0 && (
        <View style={[ui.row, { flexWrap: 'wrap', gap: 8 }]}>
          {genres.map(([g]) => (
            <View key={g} style={ui.chip}>
              <Text style={ui.chipText}>{g}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={ui.between}>
        <Text style={ui.heading}>Their rankings</Text>
        <Text style={ui.body}>{load.ranked.length} songs</Text>
      </View>
      {visible.map((r, i) => (
        <MusicRow
          key={r.item.id}
          item={r.item}
          score={r.score}
          rank={i + 1}
          onPress={() => open(r.item.id)}
        />
      ))}
      {load.ranked.length > PREVIEW && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowAll(v => !v)}
          style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={ui.link}>
            {showAll ? 'Show fewer' : `Show all ${load.ranked.length}`}
          </Text>
        </Pressable>
      )}
      {!load.ranked.length && (
        <Empty title="Nothing ranked yet" body="Once they rank songs, their list shows up here." />
      )}
    </Page>
  );
}
