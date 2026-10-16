import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, Text } from 'react-native';
import { Button, Page, ui } from '../components/Kit';
import { PlaylistImporter } from '../components/PlaylistImporter';
import { TopBar } from '../components/TopBar';
import type { RootStackParamList } from '../navigation/types';

/**
 * Paste an Apple Music or Spotify playlist link; AUX finds each song in its
 * catalog and you choose which go into your rank queue.
 */
export function AddScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Page header={<TopBar title="Add" kicker="IMPORT A PLAYLIST" />}>
      <PlaylistImporter
        intro={
          <>
            <Text style={ui.title}>{'Bring your\nplaylists.'}</Text>
            <Text style={ui.body}>
              Paste a link to an Apple Music or Spotify playlist. Its songs go into
              your rank queue so you can place them one by one.
            </Text>
          </>
        }
        addedAction={
          <Button
            title="Start ranking"
            onPress={() => nav.navigate('MainTabs', { screen: 'Rank' })}
          />
        }
        footer={
          <Pressable
            accessibilityRole="button"
            onPress={() => nav.navigate('MainTabs', { screen: 'Discover' })}
            style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
          >
            <Text style={ui.link}>Or add a single song from Discover ↗</Text>
          </Pressable>
        }
        onSearchMissing={query =>
          nav.navigate('MainTabs', { screen: 'Discover', params: { query } })
        }
      />
    </Page>
  );
}
