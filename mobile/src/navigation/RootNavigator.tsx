import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import {
  LoginScreen,
  SessionLoading,
  SessionOffline,
  SignupScreen,
} from '../screens/AuthScreens';
import { CompareScreen } from '../screens/CompareScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { FriendProfileScreen } from '../screens/SocialScreens';
import { ProfileSettingsScreen } from '../screens/ProfileSettingsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { useAuth } from '../state/AuthProvider';
import { colors } from '../theme/theme';
import { MusicDetailScreen } from '../screens/MusicDetailScreen';
import { MainTabs } from './MainTabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.background,
    border: colors.border,
    text: colors.textPrimary,
    primary: colors.accent,
  },
};

export function RootNavigator() {
  const { status, user } = useAuth();
  // A new account imports a playlist before anything else. (An older server
  // that doesn't report onboardedAt counts as set up.)
  const needsSetup = status === 'signedIn' && user?.onboardedAt === null;
  if (status === 'loading') return <SessionLoading />;
  if (status === 'offline') return <SessionOffline />;
  return (
    <NavigationContainer theme={navigationTheme}>
      {/* Logged-out users only have the login screens, so nothing else is reachable. */}
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {needsSetup ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : status === 'signedIn' ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen
              name="MusicDetail"
              component={MusicDetailScreen}
              options={{
                headerShown: true,
                headerTitle: '',
                headerBackTitle: 'Back',
              }}
            />
            <Stack.Screen
              name="Compare"
              component={CompareScreen}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen name="ProfileSettings" component={ProfileSettingsScreen} options={{ headerShown: true, headerTitle: 'Profile settings', headerBackTitle: 'Back' }} />
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
              options={{
                headerShown: true,
                headerTitle: '',
                headerBackTitle: 'Back',
              }}
            />
            <Stack.Screen
              name="FriendProfile"
              component={FriendProfileScreen}
              options={{
                headerShown: true,
                headerTitle: '',
                headerBackTitle: 'Back',
              }}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
