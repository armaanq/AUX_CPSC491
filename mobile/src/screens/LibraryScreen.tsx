import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Button, Chips, Cover, Empty, Page, ScorePill, palette, ui } from '../components/Kit';
import { TopBar } from '../components/TopBar';
import {
  findMusic,
  SENTIMENT_LABELS,
  SENTIMENT_ORDER,
  type Sentiment,
} from '../data/prototype';
import type { RootStackParamList } from '../navigation/types';
import { useRankings } from '../state/RankingsProvider';

const FILTERS = ['All', 'Loved', 'Fine', 'Disliked'] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_BAND: Record<Exclude<Filter, 'All'>, Sentiment> = {
  Loved: 'LOVED',
  Fine: 'FINE',
  Disliked: 'DISLIKED',
};

/** Every song you've ranked, best first, with its overall position. */
export function LibraryScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { rankings, loading, reload } = useRankings();
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  // Position is in the whole list, so filtering keeps each song's real rank.
  const rows = rankings
    .map((r, i) => ({ ...r, position: i + 1, item: findMusic(r.musicId) }))
    .filter(
      r =>
        r.item &&
        (filter === 'All' || r.sentiment === FILTER_BAND[filter]) &&
        (!q ||
          r.item.title.toLowerCase().includes(q) ||
          r.item.artist.toLowerCase().includes(q)),
    );

  return (
    <Page
      header={
        <TopBar
          title="Library"
          kicker={rankings.length ? `${rankings.length} RANKED` : 'YOUR RANKINGS'}
        />
      }
    >
      {loading ? (
        <View style={[ui.row, { justifyContent: 'center' }]}>
          <ActivityIndicator color={palette.ink} />
          <Text style={ui.body}>Loading your rankings…</Text>
        </View>
      ) : !rankings.length ? (
        <>
          <Empty
            title="Every list starts with one"
            body="Rank a song and it lands here, in order. Your best songs at the top."
          />
          <Button
            title="Find something to rank"
            onPress={() => nav.navigate('MainTabs', { screen: 'Rank' })}
          />
        </>
      ) : (
        <>
          <TextInput
            accessibilityLabel="Search your library"
            placeholder="Search your library…"
            placeholderTextColor={palette.muted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            style={ui.input}
            clearButtonMode="while-editing"
          />
          <Chips values={FILTERS} value={filter} onChange={setFilter} />
          {SENTIMENT_ORDER.map(band => {
            const inBand = rows.filter(r => r.sentiment === band);
            if (!inBand.length) return null;
            return (
              <View key={band} style={{ gap: 4 }}>
                <View style={[ui.between, { paddingTop: 4 }]}>
                  <Text style={ui.label}>{SENTIMENT_LABELS[band].toUpperCase()}</Text>
                  <Text style={ui.fine}>
                    {inBand.length} {inBand.length === 1 ? 'song' : 'songs'}
                  </Text>
                </View>
                {inBand.map(r => (
                  <Pressable
                    key={r.musicId}
                    accessibilityRole="button"
                    accessibilityLabel={`Number ${r.position}, ${r.item.title} by ${r.item.artist}, score ${r.score.toFixed(2)}`}
                    onPress={() => nav.navigate('MusicDetail', { musicId: r.musicId })}
                    style={({ pressed }) => [
                      ui.row,
                      { paddingVertical: 5, opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Text
                      style={{
                        width: 32,
                        textAlign: 'center',
                        fontWeight: '800',
                        color: palette.muted,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {r.position}
                    </Text>
                    <Cover item={r.item} size={50} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={ui.musicTitle} numberOfLines={1}>
                        {r.item.title}
                      </Text>
                      <Text style={[ui.body, { fontSize: 13 }]} numberOfLines={1}>
                        {r.item.artist}
                      </Text>
                    </View>
                    <ScorePill label="SCORE" score={r.score} strong />
                  </Pressable>
                ))}
              </View>
            );
          })}
          {!rows.length && (
            <Empty
              title="Nothing here"
              body={q ? 'No ranked songs match that search.' : 'No songs in this group yet.'}
            />
          )}
          <Pressable
            accessibilityRole="button"
            onPress={reload}
            style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={ui.link}>Refresh</Text>
          </Pressable>
        </>
      )}
    </Page>
  );
}
