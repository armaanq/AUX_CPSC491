import Ionicons from '@react-native-vector-icons/ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Avatar } from '../components/Avatar';
import { FriendsScreen } from '../screens/SocialScreens';
import { GlobalRankingsScreen } from '../screens/DiscoverScreens';
import { HomeScreen } from '../screens/DiscoverScreens';
import { ProfileScreen } from '../screens/SocialScreens';
import { SearchScreen } from '../screens/DiscoverScreens';
import { colors } from '../theme/theme';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

type TabIconProps = { color: string; size: number; focused: boolean };

function HomeTabIcon({ color, size, focused }: TabIconProps) {
  return (
    <Ionicons
      name={focused ? 'home' : 'home-outline'}
      color={color}
      size={size}
    />
  );
}

function SearchTabIcon({ color, size, focused }: TabIconProps) {
  return (
    <Ionicons
      name={focused ? 'search' : 'search-outline'}
      color={color}
      size={size}
    />
  );
}

function GlobalTabIcon({ color, size, focused }: TabIconProps) {
  return (
    <Ionicons
      name={focused ? 'flame' : 'flame-outline'}
      color={color}
      size={size}
    />
  );
}

function FriendsTabIcon({ color, size, focused }: TabIconProps) {
  return (
    <Ionicons
      name={focused ? 'people' : 'people-outline'}
      color={color}
      size={size}
    />
  );
}

function ProfileTabIcon() {
  return <Avatar seed="me" name="armaanq" size={26} />;
}

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: HomeTabIcon }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{ tabBarIcon: SearchTabIcon, title: 'Discover' }}
      />
      <Tab.Screen
        name="Global"
        component={GlobalRankingsScreen}
        options={{ tabBarIcon: GlobalTabIcon, title: 'Charts' }}
      />
      <Tab.Screen
        name="Friends"
        component={FriendsScreen}
        options={{ tabBarIcon: FriendsTabIcon, title: 'Circle' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: ProfileTabIcon }}
      />
    </Tab.Navigator>
  );
}
