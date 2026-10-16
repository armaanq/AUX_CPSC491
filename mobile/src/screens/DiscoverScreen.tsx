import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { searchSongs, SOURCE_NAMES } from '../api/songs';
import {
  Chips,
  Cover,
  Empty,
  Page,
  ScorePill,
  SectionHeader,
  Shelf,
  palette,
  ui,
} from '../components/Kit';
import { TopBar } from '../components/TopBar';
import {
  findMusic,
  musicFromAlbum,
  musicFromSearch,
  registerMusic,
  type Music,
} from '../data/prototype';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { useCharts } from '../state/useCharts';
import { useRankings } from '../state/RankingsProvider';
import { useSongStats } from '../state/useSongStats';

type RemoteSearch = {
  status: 'idle' | 'loading' | 'done' | 'error';
  songs: Music[];
  albums: Music[];
  credit?: string;
  error?: string;
};
const IDLE: RemoteSearch = { status: 'idle', songs: [], albums: [] };

/** A song with your score and AUX's side by side. */
function CompareRow({
  item,
  yours,
  aux,
  detail,
  onPress,
}: {
  item: Music;
  yours?: number;
  aux?: number | null;
  detail?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.artist}${
        yours !== undefined ? `, you ${yours.toFixed(2)}` : ''
      }${typeof aux === 'number' ? `, AUX ${aux.toFixed(2)}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [ui.row, { paddingVertical: 6, opacity: pressed ? 0.6 : 1 }]}
    >
      <Cover item={item} size={52} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={ui.musicTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[ui.body, { fontSize: 13 }]} numberOfLines={1}>
          {detail ?? item.artist}
        </Text>
      </View>
      <ScorePill label="YOU" score={yours} />
      <ScorePill label="AUX" score={aux} />
    </Pressable>
  );
}

/** Hottest takes shown before "Show more", and the most it can expand to. */
const TAKES = 3;
const MAX_TAKES = 10;

/**
 * Search any song and see how your score compares with everyone on AUX.
 * Before a search: the songs where you disagree with AUX most, and what's
 * trending on Apple Music.
 */
export function DiscoverScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<MainTabParamList, 'Discover'>>();
  const { rankings } = useRankings();
  const [query, setQuery] = useState(route.params?.query ?? '');
  const [kind, setKind] = useState('Songs');
  const [remote, setRemote] = useState<RemoteSearch>(IDLE);
  const [allTakes, setAllTakes] = useState(false);
  const charts = useCharts();

  // A new pre-filled query (from Add's "search manually") replaces the box.
  const preset = route.params?.query;
  useEffect(() => {
    if (preset) setQuery(preset);
  }, [preset]);

  const q = query.trim();
  const searching = q.length >= 2;
  useEffect(() => {
    if (!searching) {
      setRemote(IDLE);
      return;
    }
    // Wait until typing pauses so each keystroke isn't a request.
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
  }, [q, searching]);

  const yours = (id: string) => rankings.find(r => r.musicId === id)?.score;
  const ranked = rankings.map(r => findMusic(r.musicId)).filter(Boolean);
  const stats = useSongStats([
    ...remote.songs.map(m => m.songId),
    ...ranked.map(m => m.songId),
  ]);
  const auxOf = (m: Music) => (m.songId ? stats[m.songId]?.averageScore : undefined);
  const open = (musicId: string) => nav.navigate('MusicDetail', { musicId });

  // Your hottest takes: biggest gaps between you and AUX, among songs others ranked too.
  const takes = rankings
    .flatMap(r => {
      const m = findMusic(r.musicId);
      const s = m?.songId ? stats[m.songId] : null;
      // Your own ranking is part of the average; one listener means it's only you.
      return m && s && s.listeners > 1
        ? [{ item: m, yours: r.score, aux: s.averageScore, gap: r.score - s.averageScore }]
        : [];
    })
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, MAX_TAKES);
  const shownTakes = allTakes ? takes : takes.slice(0, TAKES);

  return (
    <Page header={<TopBar title="Discover" kicker="YOU VS. AUX" />}>
      <TextInput
        accessibilityLabel="Search music"
        placeholder="Search any song or artist…"
        placeholderTextColor={palette.muted}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        returnKeyType="search"
        style={ui.input}
        clearButtonMode="while-editing"
      />

      {!searching && (
        <>
          <View style={[ui.card, { backgroundColor: palette.ink, borderColor: palette.ink }]}>
            <Text style={[ui.label, { color: '#D6B98D' }]}>HOW YOU COMPARE</Text>
            <Text style={[ui.heading, ui.white]}>Your score. Everyone’s score.</Text>
            <Text style={[ui.body, { color: '#D5D9D0' }]}>
              Search any song to see where AUX lands on it, and where you do.
            </Text>
          </View>
          <SectionHeader title="Your hottest takes" note={takes.length ? 'vs. AUX' : undefined} />
          {shownTakes.map(t => (
            <CompareRow
              key={t.item.id}
              item={t.item}
              yours={t.yours}
              aux={t.aux}
              detail={`${t.gap > 0 ? '+' : '−'}${Math.abs(t.gap).toFixed(2)} ${
                t.gap > 0 ? 'above' : 'below'
              } AUX · ${t.item.artist}`}
              onPress={() => open(t.item.id)}
            />
          ))}
          {takes.length > TAKES && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: allTakes }}
              onPress={() => setAllTakes(v => !v)}
              style={{ minHeight: 40, justifyContent: 'center' }}
            >
              <Text style={ui.link}>
                {allTakes ? 'Show less' : `Show ${takes.length - TAKES} more`}
              </Text>
            </Pressable>
          )}
          {!takes.length && (
            <Text style={ui.body}>
              Once other people rank songs you’ve ranked, the ones where you
              disagree most show up here.
            </Text>
          )}
          <SectionHeader title="Trending on Apple Music" />
          {charts.status === 'loading' && <Text style={ui.body}>Loading the charts…</Text>}
          {charts.status === 'error' && <Text style={ui.body}>{charts.error}</Text>}
          {!!charts.songs.length && (
            <Shelf items={charts.songs.slice(0, 12)} onPress={open} />
          )}
          {!!charts.albums.length && (
            <>
              <SectionHeader title="Top albums" />
              <Shelf items={charts.albums.slice(0, 12)} onPress={open} />
            </>
          )}
          {charts.status === 'done' && <Text style={ui.fine}>Charts from Apple Music</Text>}
        </>
      )}

      {searching && (
        <>
          <Chips values={['Songs', 'Albums']} value={kind} onChange={setKind} />
          {remote.status === 'error' && (
            <Empty title="Search is unavailable" body={remote.error ?? ''} />
          )}
          <SectionHeader
            title={kind}
            note={
              remote.status === 'loading'
                ? 'Searching…'
                : `${(kind === 'Songs' ? remote.songs : remote.albums).length} found`
            }
          />
          {kind === 'Songs' &&
            remote.songs.map(m => (
              <CompareRow
                key={m.id}
                item={m}
                yours={yours(m.id)}
                aux={auxOf(m) ?? null}
                detail={[m.artist, m.albumTitle].filter(Boolean).join(' · ')}
                onPress={() => open(m.id)}
              />
            ))}
          {kind === 'Albums' &&
            remote.albums.map(m => (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                accessibilityLabel={`${m.title}, album by ${m.artist}`}
                onPress={() => open(m.id)}
                style={[ui.row, { paddingVertical: 6 }]}
              >
                <Cover item={m} size={52} />
                <View style={{ flex: 1 }}>
                  <Text style={ui.musicTitle} numberOfLines={1}>
                    {m.title}
                  </Text>
                  <Text style={[ui.body, { fontSize: 13 }]}>{m.artist} · album</Text>
                </View>
                <Text style={ui.body}>↗</Text>
              </Pressable>
            ))}
          {remote.status === 'done' &&
            !(kind === 'Songs' ? remote.songs : remote.albums).length && (
              <Empty
                title="Nothing matched."
                body="Try the song title plus the artist’s name."
              />
            )}
          {remote.status === 'done' && !!remote.credit && (
            <Text style={ui.fine}>Results from {remote.credit} · AUX scores from everyone on AUX</Text>
          )}
        </>
      )}
    </Page>
  );
}
