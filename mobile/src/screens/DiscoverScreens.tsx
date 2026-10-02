import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { searchSongs } from '../api/songs';
import {
  findMusic,
  music,
  musicFromSearch,
  people,
  registerMusic,
  type Music,
} from '../data/prototype';
import { usePrototype } from '../state/PrototypeProvider';
import {
  Button,
  Chips,
  Cover,
  Empty,
  MusicRow,
  Page,
  Shelf,
  palette,
  ui,
} from '../components/Kit';
const useNav = () =>
  useNavigation<NativeStackNavigationProp<RootStackParamList>>();
export function HomeScreen() {
  const nav = useNav();
  const { state } = usePrototype();
  const open = (musicId: string) => nav.navigate('MusicDetail', { musicId });
  const activity = people.filter(p => state.connections[p.id] === 'friends');
  return (
    <Page>
      <View style={ui.between}>
        <Text
          style={[
            ui.label,
            { fontSize: 21, letterSpacing: 5, color: palette.ink },
          ]}
        >
          AUX
        </Text>
        <Text style={ui.label}>THE LISTENING CLUB</Text>
      </View>
      <View>
        <Text style={ui.body}>Good music is better shared.</Text>
        <Text style={ui.title}>{'Find your next\n“I love this.”'}</Text>
      </View>
      <View
        style={[
          ui.card,
          { backgroundColor: palette.ink, borderColor: palette.ink },
        ]}
      >
        <Text style={[ui.label, { color: '#D6B98D' }]}>BUILD YOUR TASTE</Text>
        <Text style={[ui.heading, ui.white]}>Two songs. One choice.</Text>
        <Text style={[ui.body, { color: '#D5D9D0' }]}>
          Your favorites deserve more than a like. Compare what you love and
          find where it belongs.
        </Text>
        <Button
          title="Find something to rank  ↗"
          onPress={() => nav.navigate('MainTabs', { screen: 'Search' })}
        />
      </View>
      <View style={ui.between}>
        <Text style={ui.heading}>Your next listen</Text>
        <Text style={ui.label}>CURATED PICKS</Text>
      </View>
      <Shelf
        items={music
          .filter(
            m =>
              m.kind === 'album' &&
              !state.rankings.some(r => r.musicId === m.id),
          )
          .slice(0, 6)}
        onPress={open}
      />
      <View style={ui.between}>
        <Text style={ui.heading}>In your circle</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => nav.navigate('MainTabs', { screen: 'Friends' })}
          style={{ paddingVertical: 12 }}
        >
          <Text style={ui.link}>Find friends ↗</Text>
        </Pressable>
      </View>
      {state.activity.slice(0, 3).map(id => (
        <View key={id} style={ui.card}>
          <Text style={ui.label}>YOU RANKED · THIS DEVICE</Text>
          <MusicRow
            item={findMusic(id)}
            score={state.rankings.find(r => r.musicId === id)?.score}
            onPress={() => open(id)}
          />
        </View>
      ))}
      {activity.map(p => (
        <View key={p.id} style={ui.card}>
          <Pressable
            accessibilityRole="button"
            onPress={() => nav.navigate('FriendProfile', { friendId: p.id })}
          >
            <Text style={ui.musicTitle}>
              @{p.name} <Text style={ui.body}>has this on repeat</Text>
            </Text>
          </Pressable>
          <MusicRow
            item={findMusic(p.rankings[0].musicId)}
            score={p.rankings[0].score}
            onPress={() => open(p.rankings[0].musicId)}
          />
          <Text style={ui.body}>{p.bio}</Text>
        </View>
      ))}
      {!activity.length && (
        <Empty
          title="Make it a listening party"
          body="Add friends to discover the music at the top of their lists."
        />
      )}
      <Text style={[ui.body, { fontSize: 12 }]}>
        Demo edition · Curated catalog and sample friend activity.
      </Text>
    </Page>
  );
}
type RemoteSearch = {
  status: 'idle' | 'loading' | 'done' | 'error';
  results: Music[];
  error?: string;
};
const IDLE: RemoteSearch = { status: 'idle', results: [] };
export function SearchScreen() {
  const nav = useNav();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('All');
  const [genre, setGenre] = useState('All genres');
  const [remote, setRemote] = useState<RemoteSearch>(IDLE);
  const q = query.trim();
  const searchCatalog = q.length >= 2 && kind !== 'Albums';
  useEffect(() => {
    if (!searchCatalog) {
      setRemote(IDLE);
      return;
    }
    // Wait until typing pauses (400ms) so each keystroke isn't a request:
    // the public MusicBrainz API allows ~1 request per second.
    const controller = new AbortController();
    setRemote(r => ({ ...r, status: 'loading' }));
    const timer = setTimeout(() => {
      searchSongs(q, controller.signal)
        .then(({ results }) => {
          const items = results.map(musicFromSearch);
          registerMusic(items);
          setRemote({ status: 'done', results: items });
        })
        .catch((err: Error) => {
          if (controller.signal.aborted) return;
          setRemote({ status: 'error', results: [], error: err.message });
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, searchCatalog]);
  // Built-in demo music (albums to browse, sample songs).
  const local = music.filter(
    m =>
      !m.source &&
      (kind === 'All' || m.kind === (kind === 'Songs' ? 'song' : 'album')) &&
      (genre === 'All genres' || m.genre === genre) &&
      `${m.title} ${m.artist} ${m.albumTitle}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  const nothing =
    !local.length &&
    (!searchCatalog || remote.status === 'done') &&
    !remote.results.length;
  return (
    <Page>
      <Text style={ui.label}>GO A LITTLE DEEPER</Text>
      <Text style={ui.title}>Discover.</Text>
      <TextInput
        accessibilityLabel="Search music"
        placeholder="Songs, artists…"
        placeholderTextColor={palette.muted}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        style={ui.input}
        clearButtonMode="while-editing"
      />
      <Chips
        values={['All', 'Songs', 'Albums']}
        value={kind}
        onChange={setKind}
      />
      {!q && (
        <Chips
          values={['All genres', 'R&B', 'Hip-hop', 'Soul', 'Pop']}
          value={genre}
          onChange={setGenre}
        />
      )}
      {searchCatalog && (
        <>
          <View style={ui.between}>
            <Text style={ui.heading}>Songs</Text>
            <Text style={ui.body}>
              {remote.status === 'loading'
                ? 'Searching…'
                : `${remote.results.length} found`}
            </Text>
          </View>
          {remote.status === 'error' && (
            <Empty title="Search is unavailable" body={remote.error ?? ''} />
          )}
          {remote.results.map(m => (
            <MusicRow
              key={m.id}
              item={m}
              detail={[
                m.artist,
                m.albumTitle,
                m.source === 'spotify' ? 'via Spotify' : '',
              ]
                .filter(Boolean)
                .join(' · ')}
              onPress={() => nav.navigate('MusicDetail', { musicId: m.id })}
            />
          ))}
        </>
      )}
      {!!local.length && (
        <>
          <View style={ui.between}>
            <Text style={ui.heading}>
              {q ? 'In the demo collection' : 'Explore the collection'}
            </Text>
            <Text style={ui.body}>{local.length} titles</Text>
          </View>
          {local.map(m => (
            <MusicRow
              key={m.id}
              item={m}
              detail={`${m.artist} · ${m.kind}`}
              onPress={() => nav.navigate('MusicDetail', { musicId: m.id })}
            />
          ))}
        </>
      )}
      {nothing && (
        <>
          <Empty
            title="Nothing matched."
            body="Try the song title plus the artist's name, or clear your filters."
          />
          <Button
            title="Clear filters"
            secondary
            onPress={() => {
              setQuery('');
              setKind('All');
              setGenre('All genres');
            }}
          />
        </>
      )}
    </Page>
  );
}
export function MusicDetailScreen({
  route,
}: NativeStackScreenProps<RootStackParamList, 'MusicDetail'>) {
  const nav = useNav();
  const { state, toggleSaved, toggleFavorite } = usePrototype();
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
  const ranking = state.rankings.find(r => r.musicId === item.id);
  const saved = state.saved.includes(item.id);
  const favorite = state.favorites.includes(item.id);
  return (
    <Page insetTop={false}>
      <View style={{ alignItems: 'center', gap: 14 }}>
        <Text style={ui.label}>
          {item.source
            ? `song / ${
                item.source === 'spotify' ? 'via Spotify' : 'MusicBrainz'
              }`
            : `${item.kind} / ${item.genre}`}
        </Text>
        <Cover item={item} size={230} />
        <Text style={[ui.title, { textAlign: 'center', fontSize: 30 }]}>
          {item.title}
        </Text>
        <Text style={ui.body}>{item.artist}</Text>
      </View>
      <View style={ui.card}>
        {item.kind === 'song' ? (
          <>
            <View style={ui.between}>
              <Text style={ui.heading}>Your take</Text>
              <Text style={[ui.heading, { color: palette.green }]}>
                {ranking ? `${ranking.score.toFixed(2)} / 10` : 'Not ranked'}
              </Text>
            </View>
            <Text style={ui.body}>
              {ranking
                ? 'Tastes change. Give it another listen and see where it lands.'
                : 'A few head-to-head choices will find its place in your collection.'}
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
            saved ? '✓ In your listening queue · Remove' : '+ Want to listen'
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
        {item.externalUrl && (
          // Spotify's terms require linking back when showing its data.
          <Button
            secondary
            title={
              item.source === 'spotify'
                ? 'Open in Spotify ↗'
                : 'View on MusicBrainz ↗'
            }
            onPress={() => Linking.openURL(item.externalUrl!)}
          />
        )}
      </View>
      {item.kind === 'album' && (
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
export function GlobalRankingsScreen() {
  const nav = useNav();
  const { state } = usePrototype();
  const [genre, setGenre] = useState('All genres');
  const entries = music
    .filter(
      m => m.kind === 'song' && (genre === 'All genres' || m.genre === genre),
    )
    .map(m => {
      const ratings = [
        ...people.map(p => p.rankings.find(r => r.musicId === m.id)?.score),
        state.rankings.find(r => r.musicId === m.id)?.score,
      ].filter((v): v is number => v !== undefined);
      return {
        item: m,
        count: ratings.length,
        score: ratings.reduce((a, b) => a + b, 0) / ratings.length,
      };
    })
    .filter(r => r.count > 0)
    .sort((a, b) => b.score - a.score);
  return (
    <Page>
      <Text style={ui.label}>THE COMMUNITY EDIT</Text>
      <Text style={ui.title}>On repeat.</Text>
      <Text style={ui.body}>
        The music rising to the top of our demo listeners’ lists.
      </Text>
      <Chips
        values={['All genres', 'R&B', 'Hip-hop', 'Soul', 'Pop']}
        value={genre}
        onChange={setGenre}
      />
      <Text style={ui.label}>SAMPLE CHART · INCLUDES YOUR RATINGS</Text>
      {entries.map((r, i) => (
        <MusicRow
          key={r.item.id}
          item={r.item}
          rank={i + 1}
          score={r.score}
          detail={`${r.item.artist} · ${r.count} ${
            r.count === 1 ? 'listener' : 'listeners'
          }`}
          onPress={() => nav.navigate('MusicDetail', { musicId: r.item.id })}
        />
      ))}
      {!entries.length && (
        <Empty
          title="An open spot at the top"
          body="Rank a song to start this demo chart."
        />
      )}
    </Page>
  );
}
