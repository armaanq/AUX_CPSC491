import Ionicons from '@react-native-vector-icons/ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { View } from 'react-native';
import { FriendsDrawer } from '../components/FriendsDrawer';
import { palette } from '../components/Kit';
import { AddScreen } from '../screens/AddScreen';
import { DiscoverScreen } from '../screens/DiscoverScreen';
import { Hot100Screen } from '../screens/Hot100Screen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { RankScreen } from '../screens/RankScreen';
import { useAuth } from '../state/AuthProvider';
import { DrawerProvider } from '../state/DrawerContext';
import { findMusic } from '../data/prototype';
import { usePrototype } from '../state/PrototypeProvider';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

type TabIconProps = { color: string; size: number; focused: boolean };
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const icon =
  (filled: IconName, outline: IconName) =>
  ({ color, size, focused }: TabIconProps) =>
    <Ionicons name={focused ? filled : outline} color={color} size={size} />;

const Hot100Icon = icon('flame', 'flame-outline');
const DiscoverIcon = icon('compass', 'compass-outline');
const RankIcon = icon('swap-vertical', 'swap-vertical-outline');
const LibraryIcon = icon('library', 'library-outline');

/**
 * Add is the primary action, so it's a raised round button that sits above
 * the tab bar instead of a regular icon and label. A ring in the page colour
 * separates it from the bar's top border.
 */
function AddIcon({ focused }: TabIconProps) {
  return (
    <View
      style={{
        width: 58,
        height: 58,
        borderRadius: 29,
        marginTop: -26,
        backgroundColor: palette.paper,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 50,
          height: 50,
          borderRadius: 25,
          backgroundColor: palette.accent,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: focused ? 1.06 : 1 }],
          shadowColor: palette.accent,
          shadowOpacity: focused ? 0.45 : 0.3,
          shadowRadius: focused ? 10 : 7,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <Ionicons name="add" color="#FFFFFF" size={30} />
      </View>
    </View>
  );
}

const NoLabel = () => null;

export function MainTabs() {
  const { state } = usePrototype();
  // Right after first-run setup, open on the queue that setup just filled.
  const { firstRun } = useAuth();
  // Only songs can be ranked; queued albums don't count toward the badge.
  const queued = state.saved.filter(id => {
    const m = findMusic(id);
    return m?.kind === 'song' && !!m.source;
  }).length;
  return (
    <DrawerProvider>
      <Tab.Navigator
        initialRouteName={firstRun ? 'Rank' : 'Discover'}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: palette.accent,
          tabBarInactiveTintColor: palette.muted,
          tabBarStyle: {
            backgroundColor: palette.paper,
            borderTopColor: palette.line,
          },
          tabBarLabelStyle: { fontWeight: '700', fontSize: 11 },
        }}
      >
        {/* The first tab is where the app opens. */}
        <Tab.Screen
          name="Discover"
          component={DiscoverScreen}
          options={{ tabBarIcon: DiscoverIcon }}
        />
        <Tab.Screen
          name="Hot100"
          component={Hot100Screen}
          options={{ tabBarIcon: Hot100Icon, title: 'Hot 100' }}
        />
        <Tab.Screen
          name="Rank"
          component={RankScreen}
          options={{
            tabBarIcon: RankIcon,
            tabBarBadge: queued ? (queued > 99 ? '99+' : queued) : undefined,
            tabBarBadgeStyle: { backgroundColor: palette.accent },
          }}
        />
        <Tab.Screen
          name="Library"
          component={LibraryScreen}
          options={{ tabBarIcon: LibraryIcon }}
        />
        <Tab.Screen
          name="Add"
          component={AddScreen}
          options={{
            tabBarIcon: AddIcon,
            tabBarLabel: NoLabel,
            title: 'Add',
            tabBarAccessibilityLabel: 'Add songs from a playlist',
          }}
        />
      </Tab.Navigator>
      <FriendsDrawer />
    </DrawerProvider>
  );
}
