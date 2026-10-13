import Ionicons from '@react-native-vector-icons/ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import {
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
import { people, tasteMatch, type Person } from '../data/prototype';
import type { RootStackParamList } from '../navigation/types';
import { useDrawer } from '../state/DrawerContext';
import { usePrototype } from '../state/PrototypeProvider';
import { useRankings } from '../state/RankingsProvider';
import { Avatar } from './Avatar';
import { palette, ui } from './Kit';

const WIDTH = Math.min(340, Dimensions.get('window').width * 0.86);

/**
 * Slides in from the left: friend requests, your friends, and people to add.
 * Friends are still device-only demo profiles until the server has a friends API.
 */
export function FriendsDrawer() {
  const { isOpen, close } = useDrawer();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { state, connect } = usePrototype();
  const { rankings } = useRankings();
  const [query, setQuery] = useState('');
  const x = useRef(new Animated.Value(-WIDTH)).current;
  const [visible, setVisible] = useState(isOpen);
  // Read from the app's provider: a Modal's contents don't get safe-area insets on iOS.
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (isOpen) setVisible(true);
    Animated.timing(x, {
      toValue: isOpen ? 0 : -WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      if (!isOpen) setVisible(false);
    });
  }, [isOpen, x]);

  const q = query.trim().toLowerCase();
  const matches = (p: Person) => !q || p.name.toLowerCase().includes(q);
  const incoming = people.filter(
    p => state.connections[p.id] === 'incoming' && matches(p),
  );
  const friends = people.filter(
    p => state.connections[p.id] === 'friends' && matches(p),
  );
  const others = people.filter(
    p =>
      !['friends', 'incoming'].includes(state.connections[p.id]) && matches(p),
  );

  const open = (id: string) => {
    close();
    nav.navigate('FriendProfile', { friendId: id });
  };

  const row = (p: Person, right: React.ReactNode, note?: string) => {
    const match = tasteMatch(rankings, p.rankings);
    return (
      <View key={p.id} style={[ui.row, { paddingVertical: 6 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open @${p.name}`}
          onPress={() => open(p.id)}
          style={[ui.row, { flex: 1 }]}
        >
          <Avatar seed={p.id} name={p.name} size={42} />
          <View style={{ flex: 1 }}>
            <Text style={ui.musicTitle}>@{p.name}</Text>
            <Text style={[ui.fine]} numberOfLines={1}>
              {note ??
                (match.score === null
                  ? p.genres.join(' · ')
                  : `${match.score}% taste match`)}
            </Text>
          </View>
        </Pressable>
        {right}
      </View>
    );
  };

  const small = (label: string, onPress: () => void, primary = true) => (
    <Pressable
      accessibilityRole="button"
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
              placeholder="Find people…"
              placeholderTextColor={palette.muted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              style={ui.input}
            />
            {incoming.length > 0 && (
              <>
                <Text style={ui.label}>
                  {incoming.length} REQUEST{incoming.length === 1 ? '' : 'S'}
                </Text>
                {incoming.map(p =>
                  row(
                    p,
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {small('Accept', () => connect(p.id, 'accept'))}
                      {small('✕', () => connect(p.id, 'remove'), false)}
                    </View>,
                    'Wants to be friends',
                  ),
                )}
                <View style={ui.divider} />
              </>
            )}
            <Text style={ui.label}>FRIENDS · {friends.length}</Text>
            {friends.map(p => row(p, null))}
            {!friends.length && (
              <Text style={ui.body}>
                {q ? 'No friends match that name.' : 'Add people below to compare taste.'}
              </Text>
            )}
            <View style={ui.divider} />
            <Text style={ui.label}>DISCOVER PEOPLE</Text>
            {others.map(p =>
              row(
                p,
                state.connections[p.id] === 'outgoing'
                  ? small('Requested', () => connect(p.id, 'remove'), false)
                  : small('+ Add', () => connect(p.id, 'request')),
              ),
            )}
            {!others.length && (
              <Text style={ui.body}>
                {q ? 'Nobody else by that name yet.' : 'You’ve met everyone here.'}
              </Text>
            )}
            <Text style={ui.fine}>
              Demo profiles · friend requests stay on this device for now.
            </Text>
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
}
