import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { CHART_GENRES, chartGenreFor } from '../api/charts';
import { Button, Cover, Empty, Page, SectionHeader, palette, ui } from '../components/Kit';
import { TopBar } from '../components/TopBar';
import { findMusic, isRankable as rankable, type Music } from '../data/prototype';
import type { RootStackParamList } from '../navigation/types';
import { usePrototype } from '../state/PrototypeProvider';
import { useRankings } from '../state/RankingsProvider';
import { useCharts } from '../state/useCharts';

const SUGGESTIONS = 10;

/**
 * The genres you love most, best first: each ranked song counts for its
 * genre, loved songs three times as much, disliked ones not at all.
 */
export function topGenres(
  rankings: { musicId: string; sentiment: string }[],
): string[] {
  const weight: Record<string, number> = {};
  rankings.forEach(r => {
    const id = chartGenreFor(findMusic(r.musicId)?.genre);
    if (!id || r.sentiment === 'DISLIKED') return;
    weight[id] = (weight[id] ?? 0) + (r.sentiment === 'LOVED' ? 3 : 1);
  });
  return Object.entries(weight)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

const genreLabel = (id: string) =>
  CHART_GENRES.find(g => g.id === id)?.label ?? 'your top genre';

/** Your rank queue, then songs the app thinks you should rank next. */
export function RankScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { state, unsave, toggleSaved } = usePrototype();
  const { rankings, loading } = useRankings();
  const [first, second] = topGenres(rankings);
  // Hooks run in a fixed order; an absent genre falls back to the overall chart.
  const chartA = useCharts(first);
  const chartB = useCharts(second);
  const overall = useCharts();

  const queue = state.saved.map(findMusic).filter((m): m is Music => !!m);
  const songs = queue.filter(rankable);
  const others = queue.filter(m => !rankable(m));
  const next = songs[0];

  const taken = new Set([...rankings.map(r => r.musicId), ...state.saved]);
  const reasons = new Map<string, string>();
  const picks: Music[] = [];
  const offer = (list: Music[], reason: string) =>
    list.forEach(m => {
      if (picks.length >= SUGGESTIONS || taken.has(m.id) || reasons.has(m.id)) return;
      reasons.set(m.id, reason);
      picks.push(m);
    });
  if (first) offer(chartA.songs.slice(0, 6), `Big in ${genreLabel(first)}, which you rank highly`);
  if (second) offer(chartB.songs.slice(0, 4), `Big in ${genreLabel(second)}`);
  offer(overall.songs, 'Trending on Apple Music');
  const suggestionsLoading =
    !picks.length && [chartA, chartB, overall].some(c => c.status === 'loading');

  const rank = (id: string) => nav.navigate('Compare', { musicId: id });
  const open = (id: string) => nav.navigate('MusicDetail', { musicId: id });

  return (
    <Page
      header={
        <TopBar
          title="Rank"
          kicker={songs.length ? `${songs.length} TO RANK` : 'QUEUE IS CLEAR'}
        />
      }
    >
      {next ? (
        <View style={[ui.card, { backgroundColor: palette.ink, borderColor: palette.ink }]}>
          <Text style={[ui.label, { color: '#D6B98D' }]}>UP NEXT</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${next.title}`}
            onPress={() => open(next.id)}
            style={ui.row}
          >
            <Cover item={next} size={92} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[ui.heading, ui.white]} numberOfLines={2}>
                {next.title}
              </Text>
              <Text style={[ui.body, { color: '#D5D9D0' }]} numberOfLines={1}>
                {next.artist}
              </Text>
            </View>
          </Pressable>
          <Button
            title={loading ? 'Loading your rankings…' : 'Rank it'}
            onPress={() => !loading && rank(next.id)}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => unsave(next.id)}
            style={{ minHeight: 40, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={[ui.link, { color: '#D6B98D' }]}>Haven’t heard it · remove</Text>
          </Pressable>
        </View>
      ) : (
        <Empty
          title="Nothing waiting to be ranked"
          body="Add songs from a playlist with +, queue them from Discover, or pick one of the suggestions below."
        />
      )}

      {songs.length > 1 && (
        <>
          <SectionHeader title="In your queue" note={`${songs.length - 1} more`} />
          {songs.slice(1).map(m => (
            <View key={m.id} style={[ui.row, { paddingVertical: 4 }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${m.title}`}
                onPress={() => open(m.id)}
                style={[ui.row, { flex: 1 }]}
              >
                <Cover item={m} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={ui.musicTitle} numberOfLines={1}>
                    {m.title}
                  </Text>
                  <Text style={[ui.body, { fontSize: 13 }]} numberOfLines={1}>
                    {m.artist}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Rank ${m.title}`}
                onPress={() => rank(m.id)}
                style={rankButton}
              >
                <Text style={ui.chipText}>Rank</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${m.title} from queue`}
                onPress={() => unsave(m.id)}
                hitSlop={8}
                style={{ width: 32, alignItems: 'center' }}
              >
                <Text style={ui.body}>✕</Text>
              </Pressable>
            </View>
          ))}
        </>
      )}

      {others.length > 0 && (
        <>
          <SectionHeader title="Albums to explore" />
          <Text style={ui.body}>AUX ranks songs. Open an album to rank its tracks.</Text>
          {others.map(m => (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${m.title}`}
              onPress={() => open(m.id)}
              style={[ui.row, { paddingVertical: 4 }]}
            >
              <Cover item={m} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={ui.musicTitle} numberOfLines={1}>
                  {m.title}
                </Text>
                <Text style={[ui.body, { fontSize: 13 }]}>{m.artist}</Text>
              </View>
              <Text style={ui.body}>↗</Text>
            </Pressable>
          ))}
        </>
      )}

      <SectionHeader title="Suggested for you" />
      {suggestionsLoading && <Text style={ui.body}>Finding songs for you…</Text>}
      {picks.map(m => (
        <View key={m.id} style={[ui.row, { paddingVertical: 4 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${m.title}`}
            onPress={() => open(m.id)}
            style={[ui.row, { flex: 1 }]}
          >
            <Cover item={m} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={ui.musicTitle} numberOfLines={1}>
                {m.title}
              </Text>
              <Text style={[ui.body, { fontSize: 12 }]} numberOfLines={1}>
                {m.artist} · {reasons.get(m.id)}
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Rank ${m.title} now`}
            onPress={() => rank(m.id)}
            style={rankButton}
          >
            <Text style={ui.chipText}>Rank</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add ${m.title} to queue`}
            onPress={() => toggleSaved(m.id)}
            hitSlop={8}
            style={{ width: 32, alignItems: 'center' }}
          >
            <Text style={[ui.link, { fontSize: 20 }]}>+</Text>
          </Pressable>
        </View>
      ))}
      {!suggestionsLoading && !picks.length && (
        <Text style={ui.body}>
          No suggestions right now. Search in Discover to find something new.
        </Text>
      )}
      {!!picks.length && (
        <Text style={ui.fine}>
          Picked from Apple Music charts in the genres you rank highest, leaving
          out songs you’ve ranked or queued.
        </Text>
      )}
    </Page>
  );
}

const rankButton = {
  minHeight: 36,
  paddingHorizontal: 14,
  borderRadius: 18,
  backgroundColor: palette.soft,
  justifyContent: 'center' as const,
};
