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
export function FriendsScreen() {
  const nav = useNav();
  const { state, connect } = usePrototype();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('Friends');
  const requests = Object.values(state.connections).filter(
    s => s === 'incoming',
  ).length;
  const shown = people.filter(
    p =>
      p.name.toLowerCase().includes(query.toLowerCase().trim()) &&
      (tab === 'Find people' ||
        (tab === 'Friends'
          ? state.connections[p.id] === 'friends'
          : ['incoming', 'outgoing'].includes(state.connections[p.id]))),
  );
  return (
    <Page>
      <Text style={ui.label}>GOOD TASTE, GOOD COMPANY</Text>
      <Text style={ui.title}>Your circle.</Text>
      <Text style={ui.body}>Find your people through the music you love.</Text>
      <Chips
        values={['Friends', 'Requests', 'Find people']}
        value={tab}
        onChange={setTab}
      />
      {requests > 0 && (
        <Text style={ui.label}>
          {requests} incoming request{requests === 1 ? '' : 's'}
        </Text>
      )}
      <TextInput
        accessibilityLabel="Find people by username"
        placeholder="Find a listener…"
        placeholderTextColor={palette.muted}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        style={ui.input}
      />
      {shown.map(p => {
        const status = state.connections[p.id];
        const match = tasteMatch(state.rankings, p.rankings);
        return (
          <View key={p.id} style={ui.card}>
            <Pressable
              accessibilityRole="button"
              onPress={() => nav.navigate('FriendProfile', { friendId: p.id })}
              style={ui.row}
            >
              <Avatar seed={p.id} name={p.name} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={ui.musicTitle}>@{p.name}</Text>
                <Text style={ui.body}>{p.genres.join(' · ')}</Text>
              </View>
              <Text style={[ui.link, { color: palette.green }]}>
                {match.score === null ? 'New taste' : `${match.score}%`}
              </Text>
            </Pressable>
            {status === 'incoming' ? (
              <>
                <Text style={ui.body}>Wants to be your friend</Text>
                <Button
                  title="Accept request"
                  onPress={() => connect(p.id, 'accept')}
                />
                <Button
                  secondary
                  title="Decline"
                  onPress={() => connect(p.id, 'remove')}
                />
              </>
            ) : status === 'outgoing' ? (
              <>
                <Text style={ui.body}>
                  Request sent · Waiting for acceptance
                </Text>
                <Button
                  secondary
                  title="Cancel request"
                  onPress={() => connect(p.id, 'remove')}
                />
              </>
            ) : status !== 'friends' ? (
              <Button
                title="Send friend request"
                onPress={() => connect(p.id, 'request')}
              />
            ) : null}
          </View>
        );
      })}
      {!shown.length && (
        <Empty
          title={tab === 'Requests' ? 'All caught up' : 'No listeners here yet'}
          body="Try Find people or search for another username."
        />
      )}
      <Text style={[ui.body, { fontSize: 12 }]}>
        Demo profiles · Requests stay on this device. Maya’s incoming request
        lets you try the acceptance flow.
      </Text>
    </Page>
  );
}
export function ProfileScreen() {
  return <ProfileContent />;
}
export function FriendProfileScreen({
  route,
}: NativeStackScreenProps<RootStackParamList, 'FriendProfile'>) {
  return <ProfileContent friendId={route.params.friendId} />;
}
function ProfileContent({ friendId }: { friendId?: string }) {
  const nav = useNav();
  const { state, connect, setBio } = usePrototype();
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
  const rankings = own ? state.rankings : person!.rankings;
  const name = own ? 'armaanq' : person!.name;
  const status = friendId ? state.connections[friendId] : null;
  const favorites = own
    ? state.favorites
    : rankings.slice(0, 3).map(r => r.musicId);
  const match = tasteMatch(state.rankings, rankings);
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
                  state.rankings.some(r => findMusic(r.musicId).genre === g),
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
                  state.rankings.some(mine => mine.musicId === r.musicId),
                )
                .slice(0, 5)
                .map(r => (
                  <View key={r.musicId}>
                    <Text style={ui.musicTitle}>
                      {findMusic(r.musicId).title}
                    </Text>
                    <Text style={ui.body}>
                      {state.rankings
                        .find(mine => mine.musicId === r.musicId)!
                        .score.toFixed(2)}{' '}
                      / {r.score.toFixed(2)} ·{' '}
                      {Math.abs(
                        state.rankings.find(mine => mine.musicId === r.musicId)!
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
    </Page>
  );
}
