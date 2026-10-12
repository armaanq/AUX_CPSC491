import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { CHART_GENRES, getCommunityChart } from '../api/charts';
import { getAlbum, searchSongs, SOURCE_NAMES } from '../api/songs';
import {
  findMusic,
  music,
  musicFromAlbum,
  musicFromSearch,
  people,
  registerMusic,
  type Music,
} from '../data/prototype';
import { usePrototype } from '../state/PrototypeProvider';
import { useRankings } from '../state/RankingsProvider';
import { useCharts, type Charts } from '../state/useCharts';
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
/** "Loading…" or why the charts couldn't load; nothing once they're in. */
function ChartStatus({ charts }: { charts: Charts }) {
  if (charts.status === 'done') return null;
  return (
    <Text style={ui.body}>
      {charts.status === 'loading' ? 'Loading the charts…' : charts.error}
    </Text>
  );
}
export function HomeScreen() {
  const nav = useNav();
  const { state } = usePrototype();
  const { rankings, recent } = useRankings();
  const charts = useCharts();
  const open = (musicId: string) => nav.navigate('MusicDetail', { musicId });
  const scoreOf = (musicId: string) =>
    rankings.find(r => r.musicId === musicId)?.score;
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
        <Text style={ui.heading}>Top albums</Text>
        <Text style={ui.label}>ON APPLE MUSIC</Text>
      </View>
      <ChartStatus charts={charts} />
      {!!charts.albums.length && (
        <Shelf items={charts.albums.slice(0, 10)} onPress={open} />
      )}
      {!!charts.songs.length && (
        <>
          <View style={ui.between}>
            <Text style={ui.heading}>Top songs</Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={12}
              onPress={() => nav.navigate('MainTabs', { screen: 'Search' })}
            >
              <Text style={ui.link}>More charts ↗</Text>
            </Pressable>
          </View>
          {charts.songs.slice(0, 10).map((m, i) => (
            <MusicRow
              key={m.id}
              item={m}
              rank={i + 1}
              score={scoreOf(m.id)}
              onPress={() => open(m.id)}
            />
          ))}
        </>
      )}
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
      {recent.slice(0, 3).map(id => (
        <View key={id} style={ui.card}>
          <Text style={ui.label}>YOU RANKED</Text>
          <MusicRow
            item={findMusic(id)}
            score={scoreOf(id)}
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
      <Text style={ui.fine}>
        Charts from Apple Music · Friend activity is sample data.
      </Text>
    </Page>
  );
}
type Genre = (typeof CHART_GENRES)[number]['label'];
const GENRES = CHART_GENRES.map(g => g.label);
type RemoteSearch = {
  status: 'idle' | 'loading' | 'done' | 'error';
  songs: Music[];
  albums: Music[];
  /** Who the results came from, e.g. "Apple Music", for the credit line. */
  credit?: string;
  error?: string;
};
const IDLE: RemoteSearch = { status: 'idle', songs: [], albums: [] };
export function SearchScreen() {
  const nav = useNav();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('All');
  const [genre, setGenre] = useState<Genre>('All genres');
  const [remote, setRemote] = useState<RemoteSearch>(IDLE);
  const q = query.trim();
  const searchCatalog = q.length >= 2;
  // Before a search, Discover shows the chart for the chosen genre.
  const charts = useCharts(CHART_GENRES.find(g => g.label === genre)?.id);
  useEffect(() => {
    if (!searchCatalog) {
      setRemote(IDLE);
      return;
    }
    // Wait until typing pauses (400ms) so each keystroke isn't a request.
    const controller = new AbortController();
    setRemote(r => ({ ...r, status: 'loading' }));
    const timer = setTimeout(() => {
      searchSongs(q, controller.signal)
        .then(({ results, albums }) => {
          const songs = results.map(musicFromSearch);
          const albumItems = albums.map(musicFromAlbum);
          registerMusic([...songs, ...albumItems]);
          const source = results[0]?.source ?? albums[0]?.source;
          setRemote({
            status: 'done',
            songs,
            albums: albumItems,
            credit: source && SOURCE_NAMES[source],
          });
        })
        .catch((err: Error) => {
          if (controller.signal.aborted) return;
          setRemote({ ...IDLE, status: 'error', error: err.message });
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, searchCatalog]);
  const songs = kind === 'Albums' ? [] : remote.songs;
  const albums = kind === 'Songs' ? [] : remote.albums;
  const searching = remote.status === 'loading';
  const nothing =
    searchCatalog &&
    remote.status === 'done' &&
    !songs.length &&
    !albums.length;
  const open = (musicId: string) => nav.navigate('MusicDetail', { musicId });
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
      {!searchCatalog && (
        <>
          <Chips values={GENRES} value={genre} onChange={setGenre} />
          <ChartStatus charts={charts} />
          {kind !== 'Songs' && !!charts.albums.length && (
            <>
              <Text style={ui.heading}>Top albums</Text>
              <Shelf items={charts.albums} onPress={open} />
            </>
          )}
          {kind !== 'Albums' && !!charts.songs.length && (
            <>
              <Text style={ui.heading}>Top songs</Text>
              {charts.songs.map((m, i) => (
                <MusicRow
                  key={m.id}
                  item={m}
                  rank={i + 1}
                  onPress={() => open(m.id)}
                />
              ))}
            </>
          )}
          {charts.status === 'done' && (
            <Text style={ui.fine}>Charts from Apple Music</Text>
          )}
        </>
      )}
      {searchCatalog && remote.status === 'error' && (
        <Empty title="Search is unavailable" body={remote.error ?? ''} />
      )}
      {searchCatalog && kind !== 'Albums' && (
        <>
          <View style={ui.between}>
            <Text style={ui.heading}>Songs</Text>
            <Text style={ui.body}>
              {searching ? 'Searching…' : `${songs.length} found`}
            </Text>
          </View>
          {songs.map(m => (
            <MusicRow
              key={m.id}
              item={m}
              detail={[m.artist, m.albumTitle].filter(Boolean).join(' · ')}
              onPress={() => nav.navigate('MusicDetail', { musicId: m.id })}
            />
          ))}
        </>
      )}
      {/* "All" only shows albums when there are some; fallback catalogs don't search albums. */}
      {searchCatalog && (kind === 'Albums' || !!albums.length) && (
        <>
          <View style={ui.between}>
            <Text style={ui.heading}>Albums</Text>
            <Text style={ui.body}>
              {searching ? 'Searching…' : `${albums.length} found`}
            </Text>
          </View>
          {albums.map(m => (
            <MusicRow
              key={m.id}
              item={m}
              detail={`${m.artist} · album`}
              onPress={() => nav.navigate('MusicDetail', { musicId: m.id })}
            />
          ))}
        </>
      )}
      {searchCatalog &&
        remote.status === 'done' &&
        !!remote.credit &&
        !!(songs.length || albums.length) && (
          <Text style={ui.fine}>Results from {remote.credit}</Text>
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
type CommunityChart = {
  status: 'loading' | 'done' | 'error';
  entries: { item: Music; listeners: number; averageScore: number }[];
  error?: string;
};
export function GlobalRankingsScreen() {
  const nav = useNav();
  const { rankings } = useRankings();
  const [chart, setChart] = useState<CommunityChart>({
    status: 'loading',
    entries: [],
  });
  // Loads again whenever your rankings change, so your latest pick shows up.
  useEffect(() => {
    let current = true;
    getCommunityChart()
      .then(({ entries }) => {
        const rows = entries.map(e => ({
          item: musicFromSearch({ ...e.song, songId: e.song.id }),
          listeners: e.listeners,
          averageScore: e.averageScore,
        }));
        registerMusic(rows.map(r => r.item));
        if (current) setChart({ status: 'done', entries: rows });
      })
      .catch((err: Error) => {
        if (current) setChart({ status: 'error', entries: [], error: err.message });
      });
    return () => {
      current = false;
    };
  }, [rankings]);
  return (
    <Page>
      <Text style={ui.label}>THE COMMUNITY EDIT</Text>
      <Text style={ui.title}>On repeat.</Text>
      <Text style={ui.body}>
        The songs AUX listeners rank highest. Every ranking counts.
      </Text>
      {chart.status === 'loading' && (
        <Text style={ui.body}>Loading the chart…</Text>
      )}
      {chart.status === 'error' && (
        <Empty title="The chart is unavailable" body={chart.error ?? ''} />
      )}
      {chart.entries.map((r, i) => (
        <MusicRow
          key={r.item.id}
          item={r.item}
          rank={i + 1}
          score={r.averageScore}
          detail={`${r.item.artist} · ${r.listeners} ${
            r.listeners === 1 ? 'listener' : 'listeners'
          }`}
          onPress={() => nav.navigate('MusicDetail', { musicId: r.item.id })}
        />
      ))}
      {chart.status === 'done' && !chart.entries.length && (
        <Empty
          title="An open spot at the top"
          body="Rank a song to start the AUX chart."
        />
      )}
      {!!chart.entries.length && (
        <Text style={ui.fine}>
          Average scores from everyone on AUX. Ties go to the song more people
          ranked.
        </Text>
      )}
    </Page>
  );
}
