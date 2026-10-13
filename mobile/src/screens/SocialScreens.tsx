import React, { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { findMusic, people, tasteMatch } from '../data/prototype';
import { usePrototype } from '../state/PrototypeProvider';
import { useAuth } from '../state/AuthProvider';
import { useRankings } from '../state/RankingsProvider';
import { Avatar } from '../components/Avatar';
import {
  Button,
  Chips,
  Empty,
  MusicRow,
  Page,
  Shelf,
  palette,
  ui,
} from '../components/Kit';
const useNav = () =>
  useNavigation<NativeStackNavigationProp<RootStackParamList>>();
export function FriendProfileScreen({
  route,
}: NativeStackScreenProps<RootStackParamList, 'FriendProfile'>) {
  return <ProfileContent friendId={route.params.friendId} />;
}
/** Another listener's profile: taste match, their favorites and rankings. */
function ProfileContent({ friendId }: { friendId: string }) {
  const nav = useNav();
  const { state, connect, setBio } = usePrototype();
  const { rankings: myRankings } = useRankings();
  const { user, logOut } = useAuth();
  const [tab, setTab] = useState('Songs');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(state.bio);
  const person = people.find(p => p.id === friendId);
  const own = !friendId;
  if (!own && !person)
    return (
      <Page insetTop={own}>
        <Empty
          title="Listener not found"
          body="Return to your circle and choose another profile."
        />
      </Page>
    );
  const rankings = own ? myRankings : person!.rankings;
  const name = own ? user?.username ?? '' : person!.name;
  const status = friendId ? state.connections[friendId] : null;
  const favorites = own
    ? state.favorites
    : rankings.slice(0, 3).map(r => r.musicId);
  const match = tasteMatch(myRankings, rankings);
  const genres = Array.from(
    new Set(rankings.map(r => findMusic(r.musicId).genre)),
  );
  const open = (musicId: string) => nav.navigate('MusicDetail', { musicId });
  const visible =
    tab === 'Saved'
      ? state.saved.map(id => ({ musicId: id, score: undefined }))
      : [...rankings].sort((a, b) => b.score - a.score);
  return (
    <Page insetTop={own}>
      <Text style={ui.label}>
        {own ? 'YOUR PERSONAL LINER NOTES' : 'MEET YOUR NEXT MUSIC FRIEND'}
      </Text>
      <View style={ui.row}>
        <Avatar seed={friendId || 'me'} name={name} size={76} />
        <View style={{ flex: 1 }}>
          <Text style={[ui.title, { fontSize: 30 }]}>@{name}</Text>
          <Text style={ui.body}>
            {rankings.length} ranked
            {own
              ? ` · ${
                  Object.values(state.connections).filter(s => s === 'friends')
                    .length
                } friends`
              : ''}
          </Text>
        </View>
      </View>
      {editing ? (
        <View style={{ gap: 10 }}>
          <TextInput
            accessibilityLabel="Profile bio"
            multiline
            maxLength={160}
            value={draft}
            onChangeText={setDraft}
            style={ui.input}
          />
          <Button
            title="Save bio"
            onPress={() => {
              setBio(draft.trim());
              setEditing(false);
            }}
          />
          <Button secondary title="Cancel" onPress={() => setEditing(false)} />
        </View>
      ) : (
        <>
          <Text style={ui.body}>{own ? state.bio : person!.bio}</Text>
          {own && (
            <Pressable
              accessibilityRole="button"
              style={{ minHeight: 44, justifyContent: 'center' }}
              onPress={() => {
                setDraft(state.bio);
                setEditing(true);
              }}
            >
              <Text style={ui.link}>Edit your bio ↗</Text>
            </Pressable>
          )}
        </>
      )}
      <View style={[ui.row, { flexWrap: 'wrap' }]}>
        {genres.map(g => (
          <View key={g} style={ui.chip}>
            <Text style={ui.chipText}>{g}</Text>
          </View>
        ))}
      </View>
      {!own && (
        <>
          <Button
            title={
              status === 'friends'
                ? '✓ Friends · Remove'
                : status === 'incoming'
                ? 'Accept friend request'
                : status === 'outgoing'
                ? 'Request pending · Cancel'
                : 'Send friend request'
            }
            secondary={status === 'friends' || status === 'outgoing'}
            onPress={() => {
              if (status === 'friends')
                Alert.alert(
                  'Remove friend?',
                  `Remove @${name} from your circle?`,
                  [
                    { text: 'Keep friend', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () => connect(friendId!, 'remove'),
                    },
                  ],
                );
              else
                connect(
                  friendId!,
                  status === 'incoming'
                    ? 'accept'
                    : status === 'outgoing'
                    ? 'remove'
                    : 'request',
                );
            }}
          />
          <View style={[ui.card, { backgroundColor: '#E8EDE5' }]}>
            <Text style={ui.label}>YOUR TASTE, SIDE BY SIDE</Text>
            <Text style={[ui.title, { color: palette.green }]}>
              {match.score === null
                ? 'Still getting to know you.'
                : `${match.score}% in tune`}
            </Text>
            <Text style={ui.body}>
              {match.score === null
                ? `You share ${match.count} ranked songs. Rank at least 3 of the same titles to see a match.`
                : `Based on ${match.count} shared titles and how closely your scores agree. A small sample is only a first impression.`}
            </Text>
            <Text style={ui.musicTitle}>Shared genres</Text>
            <Text style={ui.body}>
              {genres
                .filter(g =>
                  myRankings.some(r => findMusic(r.musicId).genre === g),
                )
                .join(' · ') || 'More to discover together'}
            </Text>
          </View>
          {match.count > 0 && (
            <View style={ui.card}>
              <Text style={ui.heading}>Where you meet (or don’t)</Text>
              <Text style={ui.body}>Your score / their score</Text>
              {rankings
                .filter(r =>
                  myRankings.some(mine => mine.musicId === r.musicId),
                )
                .slice(0, 5)
                .map(r => (
                  <View key={r.musicId}>
                    <Text style={ui.musicTitle}>
                      {findMusic(r.musicId).title}
                    </Text>
                    <Text style={ui.body}>
                      {myRankings
                        .find(mine => mine.musicId === r.musicId)!
                        .score.toFixed(2)}{' '}
                      / {r.score.toFixed(2)} ·{' '}
                      {Math.abs(
                        myRankings.find(mine => mine.musicId === r.musicId)!
                          .score - r.score,
                      ) < 1
                        ? 'On the same wavelength'
                        : 'A different take'}
                    </Text>
                  </View>
                ))}
            </View>
          )}
        </>
      )}
      <View>
        <Text style={ui.heading}>
          {own ? 'The favorites shelf' : 'Their top rotation'}
        </Text>
        <Text style={ui.body}>
          {own
            ? 'The music that feels like you.'
            : 'Start here to understand their taste.'}
        </Text>
      </View>
      {favorites.length ? (
        <Shelf items={favorites.map(findMusic)} onPress={open} />
      ) : (
        <Empty
          title="Make this space yours"
          body="Open any song or album and pin it to your favorites."
        />
      )}
      {own && (
        <Chips values={['Songs', 'Saved']} value={tab} onChange={setTab} />
      )}
      <View style={ui.between}>
        <Text style={ui.heading}>
          {tab === 'Saved'
            ? 'Your listening queue'
            : `${own ? 'Your' : 'Their'} rankings`}
        </Text>
        <Text style={ui.body}>{visible.length} titles</Text>
      </View>
      {visible.map((r, i) => (
        <MusicRow
          key={r.musicId}
          item={findMusic(r.musicId)}
          score={r.score}
          rank={tab === 'Saved' ? undefined : i + 1}
          onPress={() => open(r.musicId)}
        />
      ))}
      {!visible.length && (
        <Empty
          title={
            tab === 'Saved'
              ? 'Room for your next discovery'
              : 'Every list starts with one'
          }
          body={
            own
              ? 'Discover music and add it to your collection.'
              : 'This listener hasn’t ranked any songs yet.'
          }
        />
      )}
      {own && (
        <Button
          secondary
          title="Log out"
          onPress={() =>
            Alert.alert('Log out of AUX?', `You're logged in as @${name}.`, [
              { text: 'Stay logged in', style: 'cancel' },
              { text: 'Log out', style: 'destructive', onPress: logOut },
            ])
          }
        />
      )}
    </Page>
  );
}
