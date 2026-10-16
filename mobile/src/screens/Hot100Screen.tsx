import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { getCommunityChart, HOT100_GENRES } from '../api/charts';
import { Chips, Cover, Empty, Page, ScorePill, palette, ui } from '../components/Kit';
import { TopBar } from '../components/TopBar';
import { musicFromSearch, registerMusic, type Music } from '../data/prototype';
import type { RootStackParamList } from '../navigation/types';
import { useRankings } from '../state/RankingsProvider';

type Genre = (typeof HOT100_GENRES)[number]['label'];
const GENRES = HOT100_GENRES.map(g => g.label);
const SIZE = 100;

type Chart = {
  status: 'loading' | 'done' | 'error';
  entries: { item: Music; listeners: number; averageScore: number }[];
  error?: string;
};

/** The 100 songs AUX ranks highest, overall or for one genre. */
export function Hot100Screen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { rankings } = useRankings();
  const [genre, setGenre] = useState<Genre>('All');
  const [chart, setChart] = useState<Chart>({ status: 'loading', entries: [] });
  const key = HOT100_GENRES.find(g => g.label === genre)?.key;

  // Reloads when your rankings change, so your latest pick counts right away.
  useEffect(() => {
    let current = true;
    setChart(c => ({ ...c, status: 'loading' }));
    getCommunityChart(key, SIZE)
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
  }, [key, rankings]);

  const yours = (id: string) => rankings.find(r => r.musicId === id)?.score;

  return (
    <Page header={<TopBar title="Hot 100" kicker="RANKED BY AUX" />}>
      <Chips values={GENRES} value={genre} onChange={setGenre} />
      {chart.status === 'loading' && !chart.entries.length && (
        <Text style={ui.body}>Loading the chart…</Text>
      )}
      {chart.status === 'error' && (
        <Empty title="The chart is unavailable" body={chart.error ?? ''} />
      )}
      {chart.entries.map((r, i) => (
        <Pressable
          key={r.item.id}
          accessibilityRole="button"
          accessibilityLabel={`Number ${i + 1}, ${r.item.title} by ${r.item.artist}, AUX score ${r.averageScore.toFixed(2)}`}
          onPress={() => nav.navigate('MusicDetail', { musicId: r.item.id })}
          style={({ pressed }) => [
            ui.row,
            { paddingVertical: 6, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text
            style={{
              width: 34,
              textAlign: 'center',
              fontSize: i < 3 ? 22 : 16,
              fontWeight: '800',
              color: i < 3 ? palette.accent : palette.muted,
              fontVariant: ['tabular-nums'],
            }}
          >
            {i + 1}
          </Text>
          <Cover item={r.item} size={52} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={ui.musicTitle} numberOfLines={1}>
              {r.item.title}
            </Text>
            <Text style={[ui.body, { fontSize: 13 }]} numberOfLines={1}>
              {r.item.artist} · {r.listeners}{' '}
              {r.listeners === 1 ? 'listener' : 'listeners'}
            </Text>
          </View>
          {yours(r.item.id) !== undefined && (
            <ScorePill label="YOU" score={yours(r.item.id)} />
          )}
          <ScorePill label="AUX" score={r.averageScore} strong />
        </Pressable>
      ))}
      {chart.status === 'done' && !chart.entries.length && (
        <Empty
          title="An open spot at the top"
          body={
            key
              ? `Nobody has ranked a ${genre} song yet. Rank one to start this chart.`
              : 'Rank a song to start the AUX chart.'
          }
        />
      )}
      {!!chart.entries.length && (
        <Text style={ui.fine}>
          Average scores from everyone on AUX. Songs are ordered by that
          average, weighted by how many people ranked them, so one listener’s
          10.00 can’t top the chart.
        </Text>
      )}
    </Page>
  );
}
