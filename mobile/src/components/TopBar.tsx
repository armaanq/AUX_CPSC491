import Ionicons from '@react-native-vector-icons/ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthProvider';
import { useDrawer } from '../state/DrawerContext';
import { useFriends } from '../state/FriendsProvider';
import { Avatar } from './Avatar';
import { palette, ui } from './Kit';

/**
 * The header on every tab: friends drawer on the left, the tab's title in the
 * middle, your profile on the right.
 */
export function TopBar({ title, kicker }: { title: string; kicker?: string }) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const drawer = useDrawer();
  const { user } = useAuth();
  const requests = useFriends().incoming.length;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingTop: 4,
        paddingBottom: 8,
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: palette.line,
        backgroundColor: palette.paper,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          requests
            ? `Friends, ${requests} new request${requests === 1 ? '' : 's'}`
            : 'Friends'
        }
        onPress={drawer.open}
        hitSlop={8}
        style={{ width: 44, height: 44, justifyContent: 'center' }}
      >
        <Ionicons name="people-outline" size={26} color={palette.ink} />
        {requests > 0 && (
          <View
            style={{
              position: 'absolute',
              top: 6,
              right: 4,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: palette.accent,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 4,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>
              {requests}
            </Text>
          </View>
        )}
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        {kicker && <Text style={[ui.label, { fontSize: 10 }]}>{kicker}</Text>}
        <Text
          accessibilityRole="header"
          style={{
            fontSize: 20,
            fontWeight: '800',
            letterSpacing: -0.5,
            color: palette.ink,
          }}
        >
          {title}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Your profile"
        onPress={() => nav.navigate('Profile')}
        hitSlop={8}
        style={{ width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' }}
      >
        <Avatar avatarUrl={user?.avatarUrl} seed="me" name={user?.username ?? ''} size={34} />
      </Pressable>
    </View>
  );
}
