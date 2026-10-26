import Ionicons from '@react-native-vector-icons/ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchUsers, type PublicUser } from '../api/users';
import type { RootStackParamList } from '../navigation/types';
import { useDrawer } from '../state/DrawerContext';
import { useFriends } from '../state/FriendsProvider';
import { Avatar } from './Avatar';
import { palette, ui } from './Kit';

const WIDTH = Math.min(340, Dimensions.get('window').width * 0.86);

type Found =
  | { status: 'loading'; users: PublicUser[] }
  | { status: 'done'; users: PublicUser[] }
  | { status: 'error'; users: PublicUser[]; error: string };

/** "87% taste match", or what you have in common so far. */
export function tasteLine(u: PublicUser) {
  if (u.taste.score !== null) return `${u.taste.score}% taste match`;
  if (u.taste.shared) return `${u.taste.shared} song${u.taste.shared === 1 ? '' : 's'} in common`;
  return `${u.rankedCount} ranked`;
}

/**
 * Slides in from the left: friend requests, your friends, and people on AUX
 * to add (searched by username, or the newest listeners).
 */
export function FriendsDrawer() {
  const { isOpen, close } = useDrawer();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const friends = useFriends();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found>({ status: 'loading', users: [] });
  const x = useRef(new Animated.Value(-WIDTH)).current;
  const [visible, setVisible] = useState(isOpen);
  // Read from the app's provider: a Modal's contents don't get safe-area insets on iOS.
  const insets = useSafeAreaInsets();
  const { reload } = friends;

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      // Requests and taste matches change while the drawer is closed.
      reload();
    }
    Animated.timing(x, {
      toValue: isOpen ? 0 : -WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      // A close cut short by reopening mustn't hide the drawer.
      if (finished && !isOpen) setVisible(false);
    });
  }, [isOpen, x, reload]);

  const q = query.trim();
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setFound(f => ({ status: 'loading', users: f.users }));
    // Wait until typing pauses so each keystroke isn't a request.
    const timer = setTimeout(
      () =>
        searchUsers(q, controller.signal)
          .then(({ users }) => setFound({ status: 'done', users }))
          .catch((err: Error) => {
            if (!controller.signal.aborted)
              setFound({ status: 'error', users: [], error: err.message });
          }),
      q ? 300 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, isOpen]);

  const open = (user: PublicUser) => {
    close();
    nav.navigate('FriendProfile', { userId: user.id });
  };

  const matches = (u: PublicUser) =>
    !q || u.username.includes(q.replace(/^@/, '').toLowerCase());
  const incoming = friends.incoming.filter(matches);
  const mine = friends.friends.filter(matches);
  const sent = friends.outgoing.filter(matches);
  // People to add: search results you aren't already connected to.
  const others = found.users.filter(u => friends.statusOf(u.id) === 'none');

  const row = (u: PublicUser, right: React.ReactNode, note?: string) => (
    <View key={u.id} style={[ui.row, { paddingVertical: 6 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open @${u.username}`}
        onPress={() => open(u)}
        style={[ui.row, { flex: 1 }]}
      >
        <Avatar avatarUrl={u.avatarUrl} seed={u.id} name={u.username} size={42} />
        <View style={{ flex: 1 }}>
          <Text style={ui.musicTitle} numberOfLines={1}>
            @{u.username}
          </Text>
          <Text style={ui.fine} numberOfLines={1}>
            {note ?? tasteLine(u)}
          </Text>
        </View>
      </Pressable>
      {right}
    </View>
  );

  const small = (label: string, onPress: () => void, primary = true, a11y?: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={{
        minHeight: 36,
        paddingHorizontal: 12,
        borderRadius: 18,
        justifyContent: 'center',
        backgroundColor: primary ? palette.ink : palette.soft,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: '800',
          color: primary ? '#FFFFFF' : palette.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
  // Failures show as friends.error; the lists put themselves back.
  const quietly = (p: Promise<void>) => p.catch(() => {});

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={close}
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close friends"
        onPress={close}
        style={{ flex: 1, backgroundColor: 'rgba(20,22,20,0.35)' }}
      />
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: WIDTH,
          backgroundColor: palette.paper,
          transform: [{ translateX: x }],
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 18,
          elevation: 12,
        }}
      >
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <View style={[ui.between, { paddingHorizontal: 20, paddingTop: 8 }]}>
            <View>
              <Text style={ui.label}>YOUR CIRCLE</Text>
              <Text style={[ui.heading, { fontSize: 26 }]}>Friends</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={close}
              hitSlop={10}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={26} color={palette.ink} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, gap: 14 }}
          >
            <TextInput
              accessibilityLabel="Find people by username"
              placeholder="Find people by username…"
              placeholderTextColor={palette.muted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              style={ui.input}
            />
            {friends.error && (
              <Text accessibilityRole="alert" style={[ui.body, { color: palette.accent }]}>
                {friends.error}
              </Text>
            )}
            {incoming.length > 0 && (
              <>
                <Text style={ui.label}>
                  {incoming.length} REQUEST{incoming.length === 1 ? '' : 'S'}
                </Text>
                {incoming.map(u =>
                  row(
                    u,
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {small('Accept', () => quietly(friends.add(u)), true, `Accept @${u.username}`)}
                      {small('✕', () => quietly(friends.remove(u)), false, `Decline @${u.username}`)}
                    </View>,
                    'Wants to be friends',
                  ),
                )}
                <View style={ui.divider} />
              </>
            )}
            <Text style={ui.label}>FRIENDS · {friends.friends.length}</Text>
            {mine.map(u => row(u, null))}
            {!mine.length && (
              <Text style={ui.body}>
                {friends.loading && !friends.friends.length
                  ? 'Loading your friends…'
                  : q
                  ? 'No friends match that name.'
                  : 'Find people below to compare taste.'}
              </Text>
            )}
            {sent.length > 0 && (
              <>
                <Text style={ui.label}>SENT</Text>
                {sent.map(u =>
                  row(
                    u,
                    small('Requested', () => quietly(friends.remove(u)), false, `Cancel request to @${u.username}`),
                  ),
                )}
              </>
            )}
            <View style={ui.divider} />
            <Text style={ui.label}>{q ? 'PEOPLE ON AUX' : 'NEW ON AUX'}</Text>
            {found.status === 'loading' && !others.length && (
              <ActivityIndicator color={palette.ink} />
            )}
            {found.status === 'error' && <Text style={ui.body}>{found.error}</Text>}
            {others.map(u => row(u, small('+ Add', () => quietly(friends.add(u)), true, `Add @${u.username}`)))}
            {found.status === 'done' && !others.length && (
              <Text style={ui.body}>
                {q ? `Nobody else matches “${q}”.` : 'You’re connected with everyone new.'}
              </Text>
            )}
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
}
