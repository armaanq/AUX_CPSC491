import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { getAlbum, SOURCE_NAMES } from '../api/songs';
import {
  findMusic,
  music,
  musicFromSearch,
  people,
  registerMusic,
  type Music,
} from '../data/prototype';
import { usePrototype } from '../state/PrototypeProvider';
import { useRankings } from '../state/RankingsProvider';
import { useSongStats } from '../state/useSongStats';
import {
  Button,
  Cover,
  Empty,
  MusicRow,
  Page,
  palette,
  scoreTone,
  ui,
} from '../components/Kit';
const useNav = () =>
  useNavigation<NativeStackNavigationProp<RootStackParamList>>();

/** Your score next to everyone's, and what the gap says. */
function YouVsAux({ item, yours }: { item: Music; yours?: number }) {
  const stats = useSongStats([item.songId]);
  const aux = item.songId ? stats[item.songId] : null;
  const gap = aux && yours !== undefined ? yours - aux.averageScore : null;
  const verdict =
    gap === null
      ? aux
        ? 'Rank it to see where you stand.'
        : yours !== undefined
        ? 'You’re the first on AUX to rank this.'
        : 'Nobody on AUX has ranked this yet.'
      : Math.abs(gap) < 0.75
      ? 'You and AUX are on the same page.'
      : gap > 0
      ? `You rate it ${gap.toFixed(2)} higher than AUX does.`
      : `You rate it ${Math.abs(gap).toFixed(2)} lower than AUX does.`;
  const cell = (label: string, value: number | undefined, note: string) => (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={ui.label}>{label}</Text>
      <Text
        style={{
          fontSize: 34,
          fontWeight: '800',
          letterSpacing: -1,
          color: value === undefined ? palette.muted : scoreTone(value),
          fontVariant: ['tabular-nums'],
        }}
      >
        {value === undefined ? '—' : value.toFixed(2)}
      </Text>
      <Text style={ui.fine}>{note}</Text>
    </View>
  );
  return (
    <View style={ui.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {cell('YOU', yours, yours === undefined ? 'Not ranked' : 'Your score')}
        <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: palette.line }} />
        {cell(
          'AUX',
          aux?.averageScore,
          aux
            ? `${aux.listeners} ${aux.listeners === 1 ? 'listener' : 'listeners'}`
            : 'No rankings yet',
        )}
      </View>
      <Text style={[ui.body, { textAlign: 'center' }]}>{verdict}</Text>
    </View>
  );
}

export function MusicDetailScreen({
  route,
}: NativeStackScreenProps<RootStackParamList, 'MusicDetail'>) {
  const nav = useNav();
  const { state, toggleSaved, toggleFavorite } = usePrototype();
  const { rankings } = useRankings();
  const item = findMusic(route.params.musicId);
  if (!item)
    return (
      <Page insetTop={false}>
        <Empty
          title="Music unavailable"
          body="Return to Discover to explore the catalog."
        />
      </Page>
    );
  const ranking = rankings.find(r => r.musicId === item.id);
  const saved = state.saved.includes(item.id);
  const favorite = state.favorites.includes(item.id);
  return (
    <Page insetTop={false}>
      <View style={{ alignItems: 'center', gap: 14 }}>
        <Text style={ui.label}>
          {item.source
            ? `${item.kind} / ${SOURCE_NAMES[item.source]}`
            : `${item.kind} / ${item.genre}`}
        </Text>
        <Cover item={item} size={230} />
        <Text style={[ui.title, { textAlign: 'center', fontSize: 30 }]}>
          {item.title}
        </Text>
        <Text style={ui.body}>{item.artist}</Text>
      </View>
      {item.kind === 'song' && <YouVsAux item={item} yours={ranking?.score} />}
      <View style={ui.card}>
        {item.kind === 'song' ? (
          <>
            <Text style={ui.body}>
              {ranking
                ? 'Tastes change. Give it another listen and see where it lands.'
                : 'A few head-to-head choices will find its place in your library.'}
            </Text>
            <Button
              title={ranking ? 'Rank again' : 'Rank this song'}
              onPress={() => nav.navigate('Compare', { musicId: item.id })}
            />
          </>
        ) : (
          <>
            <Text style={ui.heading}>Rank the songs</Text>
            <Text style={ui.body}>
              AUX ranks songs, not albums. Pick a track below to give it your
              take.
            </Text>
          </>
        )}
        <Button
          secondary
          title={
            saved ? '✓ In your rank queue · Remove' : '+ Add to rank queue'
          }
          onPress={() => toggleSaved(item.id)}
        />
        <Button
          secondary
          title={
            favorite ? '♥ Pinned to profile · Unpin' : '♡ Pin to your favorites'
          }
          onPress={() => toggleFavorite(item.id)}
        />
        {item.externalUrl && item.source && (
          // Apple Music and Spotify ask apps showing their data to link back to them.
          <Button
            secondary
            title={
              item.source === 'musicbrainz'
                ? 'View on MusicBrainz ↗'
                : `Open in ${SOURCE_NAMES[item.source]} ↗`
            }
            onPress={() => Linking.openURL(item.externalUrl!)}
          />
        )}
      </View>
      {item.kind === 'album' && item.source && <AlbumTracks album={item} />}
      {item.kind === 'album' && !item.source && (
        <>
          <Text style={ui.heading}>Songs in this demo</Text>
          {music
            .filter(m => m.kind === 'song' && m.albumTitle === item.title)
            .map(m => (
              <MusicRow
                key={m.id}
                item={m}
                onPress={() => nav.push('MusicDetail', { musicId: m.id })}
              />
            ))}
          <Text style={ui.body}>
            This is a selection, not the complete album tracklist.
          </Text>
        </>
      )}
      {item.kind === 'song' && <Text style={ui.heading}>From your circle</Text>}
      {item.kind === 'song' &&
        people
          .filter(
            p =>
              state.connections[p.id] === 'friends' &&
              p.rankings.some(r => r.musicId === item.id),
          )
          .map(p => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              style={ui.card}
              onPress={() => nav.navigate('FriendProfile', { friendId: p.id })}
            >
              <View style={ui.between}>
                <Text style={ui.musicTitle}>@{p.name}</Text>
                <Text style={ui.heading}>
                  {p.rankings
                    .find(r => r.musicId === item.id)!
                    .score.toFixed(2)}
                </Text>
              </View>
            </Pressable>
          ))}
      {item.kind === 'song' &&
        !people.some(
          p =>
            state.connections[p.id] === 'friends' &&
            p.rankings.some(r => r.musicId === item.id),
        ) && (
          <Text style={ui.body}>
            No friends have ranked this yet. Start the conversation.
          </Text>
        )}
    </Page>
  );
}
type Tracklist = {
  status: 'loading' | 'done' | 'error';
  tracks: Music[];
  error?: string;
};
/** A catalog album's songs, each one rankable. */
function AlbumTracks({ album }: { album: Music }) {
  const nav = useNav();
  const [list, setList] = useState<Tracklist>({
    status: 'loading',
    tracks: [],
  });
  const { source, externalId } = album;
  useEffect(() => {
    if (!source || !externalId) return;
    let current = true;
    getAlbum(source, externalId)
      .then(({ tracks }) => {
        const items = tracks.map(musicFromSearch);
        registerMusic(items);
        if (current) setList({ status: 'done', tracks: items });
      })
      .catch((err: Error) => {
        if (current) setList({ status: 'error', tracks: [], error: err.message });
      });
    return () => {
      current = false;
    };
  }, [source, externalId]);
  return (
    <>
      <View style={ui.between}>
        <Text style={ui.heading}>Tracklist</Text>
        <Text style={ui.body}>
          {list.status === 'loading' ? 'Loading…' : `${list.tracks.length} songs`}
        </Text>
      </View>
      {list.status === 'error' && (
        <Empty title="Couldn’t load the songs" body={list.error ?? ''} />
      )}
      {list.tracks.map((m, i) => (
        <MusicRow
          key={m.id}
          item={m}
          rank={i + 1}
          onPress={() => nav.push('MusicDetail', { musicId: m.id })}
        />
      ))}
    </>
  );
}
