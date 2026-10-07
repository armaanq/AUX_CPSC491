import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import {
  bandOf,
  findMusic,
  insertRanking,
  SENTIMENT_BANDS,
  SENTIMENT_LABELS,
  SENTIMENT_ORDER,
  type Ranking,
  type Sentiment,
} from '../data/prototype';
import { usePrototype } from '../state/PrototypeProvider';
import { useRankings } from '../state/RankingsProvider';
import { Button, Cover, Empty, Page, palette, ui } from '../components/Kit';
type Range = { lo: number; hi: number; excluded: string[] };
export function CompareScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Compare'>) {
  const { unsave } = usePrototype();
  const { rankings, rank, loading } = useRankings();
  const item = findMusic(route.params.musicId);
  // Snapshot of the user's other songs, taken when comparing starts so the list
  // doesn't shift under them mid-comparison. Already ordered best-first.
  const [others, setOthers] = useState<Ranking[]>([]);
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [range, setRange] = useState<Range>({ lo: 0, hi: 0, excluded: [] });
  const [history, setHistory] = useState<Range[]>([]);
  const [saved, setSaved] = useState(false);
  const committed = useRef(false);
  if (!item || item.kind !== 'song')
    return (
      <Page>
        <Empty
          title="Only songs can be ranked"
          body="Open a song from this album to rank it instead."
        />
        <Button title="Go back" onPress={() => navigation.goBack()} />
      </Page>
    );
  if (!item.source)
    return (
      <Page>
        <Empty
          title="This is a sample song"
          body="Samples aren’t saved to your account. Search for it in Discover to rank the real track."
        />
        <Button
          title="Search in Discover"
          onPress={() => {
            navigation.goBack();
            navigation.navigate('MainTabs', { screen: 'Search' });
          }}
        />
        <Button secondary title="Go back" onPress={() => navigation.goBack()} />
      </Page>
    );
  // Comparing against a half-loaded list would put the song in the wrong spot.
  if (loading)
    return (
      <Page>
        <ActivityIndicator color={palette.ink} />
        <Text style={ui.body}>Loading your rankings…</Text>
      </Page>
    );
  const list = sentiment ? bandOf(others, sentiment) : [];
  // Songs in better bands sit above this one in the overall list.
  const aboveBand = sentiment
    ? others.filter(
        r =>
          SENTIMENT_ORDER.indexOf(r.sentiment) <
          SENTIMENT_ORDER.indexOf(sentiment),
      ).length
    : 0;
  const overallRank = aboveBand + range.lo + 1;
  const candidates = list
    .map((r, index) => ({ ...r, index }))
    .filter(
      r =>
        r.index >= range.lo &&
        r.index < range.hi &&
        !range.excluded.includes(r.musicId),
    );
  const middle = Math.floor((range.lo + range.hi) / 2);
  const sameGenre = candidates.filter(
    r => findMusic(r.musicId).genre === item.genre,
  );
  const pivot = (sameGenre.length ? sameGenre : candidates).sort(
    (a, b) => Math.abs(a.index - middle) - Math.abs(b.index - middle),
  )[0];
  const done = !!sentiment && range.lo >= range.hi;
  const stalled = !!sentiment && !done && !pivot;
  const preview = sentiment
    ? insertRanking(rankings, item.id, sentiment, range.lo).find(
        r => r.musicId === item.id,
      )
    : undefined;
  function react(choice: Sentiment) {
    const snapshot = rankings.filter(r => r.musicId !== item!.id);
    setOthers(snapshot);
    setSentiment(choice);
    setRange({ lo: 0, hi: bandOf(snapshot, choice).length, excluded: [] });
    setHistory([]);
  }
  function choose(newWins: boolean) {
    if (!pivot) return;
    setHistory(h => [...h, range]);
    setRange(r =>
      newWins ? { ...r, hi: pivot.index } : { ...r, lo: pivot.index + 1 },
    );
  }
  const bandName = sentiment ? SENTIMENT_LABELS[sentiment].toLowerCase() : '';
  return (
    <Page>
      <View style={ui.between}>
        <Text style={ui.label}>
          {saved ? 'IN YOUR COLLECTION' : 'RANK A SONG'}
        </Text>
        <Pressable
          accessibilityRole="button"
          style={{ minHeight: 44, justifyContent: 'center' }}
          onPress={() => navigation.goBack()}
        >
          <Text style={ui.link}>{saved ? 'Close' : 'Cancel'}</Text>
        </Pressable>
      </View>
      {saved ? (
        <>
          <Text style={ui.title}>That’s your take.</Text>
          <View style={[ui.card, { alignItems: 'center' }]}>
            <Cover item={item} size={210} />
            <Text style={ui.heading}>{item.title}</Text>
            <Text style={ui.body}>{item.artist}</Text>
            <Text style={[ui.title, { fontSize: 64, color: palette.green }]}>
              {rankings.find(r => r.musicId === item.id)?.score.toFixed(2)}
            </Text>
            <Text style={ui.body}>#{overallRank} in your songs</Text>
          </View>
          <Button
            title="See your collection"
            onPress={() => {
              navigation.goBack();
              navigation.navigate('MainTabs', { screen: 'Profile' });
            }}
          />
        </>
      ) : !sentiment ? (
        <>
          <Text style={ui.title}>{'First, how did\nit land?'}</Text>
          <View style={[ui.card, ui.row]}>
            <Cover item={item} size={100} />
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={ui.heading}>{item.title}</Text>
              <Text style={ui.body}>{item.artist}</Text>
            </View>
          </View>
          <Text style={ui.body}>
            Your reaction sets the range. A few head-to-head choices then find
            its exact spot.
          </Text>
          {SENTIMENT_ORDER.map(s => (
            <Button
              key={s}
              secondary={s !== 'LOVED'}
              title={`${SENTIMENT_LABELS[s]} · ${SENTIMENT_BANDS[s].min.toFixed(
                2,
              )}–${SENTIMENT_BANDS[s].max.toFixed(2)}`}
              onPress={() => react(s)}
            />
          ))}
        </>
      ) : done ? (
        <>
          <Text style={ui.title}>
            {list.length ? 'Found its place.' : 'First of its kind.'}
          </Text>
          <View style={[ui.card, { alignItems: 'center' }]}>
            <Cover item={item} size={190} />
            <Text style={ui.heading}>{item.title}</Text>
            <Text style={[ui.title, { color: palette.green }]}>
              {preview?.score.toFixed(2)}
            </Text>
            <Text style={ui.body}>#{overallRank} in your songs</Text>
          </View>
          <Text style={ui.body}>
            {list.length
              ? `Scores across your “${bandName}” songs shift to make room, so a few of them may move slightly.`
              : `It’s your first “${bandName}” song, so it starts at the top of that range. Scores spread out as you add more.`}
          </Text>
          <Button
            title="Save to my rankings"
            onPress={() => {
              if (committed.current) return;
              committed.current = true;
              rank(item.id, sentiment, range.lo);
              unsave(item.id);
              setSaved(true);
            }}
          />
        </>
      ) : stalled ? (
        <>
          <Text style={ui.title}>More listening, less guessing.</Text>
          <Text style={ui.body}>
            You skipped the remaining comparisons. Listen to more of your
            collection and come back to rank this one.
          </Text>
          <Button
            title="Start comparisons over"
            onPress={() => {
              setRange({ lo: 0, hi: list.length, excluded: [] });
              setHistory([]);
            }}
          />
        </>
      ) : (
        <>
          <Text style={ui.title}>{'Which stays\non repeat?'}</Text>
          <Text style={ui.body}>
            Choose the one you’d come back to. We’ll find its place among your “
            {bandName}” songs.
          </Text>
          <Text style={ui.label}>
            CHOICE {history.length + 1} ·{' '}
            {findMusic(pivot.musicId).genre === item.genre
              ? item.genre
              : 'EXPLORING YOUR OTHER GENRES'}
          </Text>
          {[item, findMusic(pivot.musicId)].map((m, index) => (
            <React.Fragment key={m.id}>
              {index === 1 && (
                <Text style={[ui.label, { textAlign: 'center' }]}>OR</Text>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Prefer ${m.title} by ${m.artist}`}
                onPress={() => choose(index === 0)}
                style={({ pressed }) => [
                  ui.card,
                  ui.row,
                  {
                    backgroundColor: pressed ? '#E8EDE5' : '#FFFFFF',
                    padding: 16,
                  },
                ]}
              >
                <Cover item={m} size={100} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Text style={ui.label}>
                    {index === 0 ? 'YOUR NEW PICK' : 'FROM YOUR LIST'}
                  </Text>
                  <Text style={ui.heading}>{m.title}</Text>
                  <Text style={ui.body}>{m.artist}</Text>
                </View>
              </Pressable>
            </React.Fragment>
          ))}
          <Button
            secondary
            title="Haven’t heard the other one · Skip"
            onPress={() => {
              setHistory(h => [...h, range]);
              setRange(r => ({
                ...r,
                excluded: [...r.excluded, pivot.musicId],
              }));
            }}
          />
        </>
      )}
      {!saved && history.length > 0 && (
        <Button
          secondary
          title="Undo last choice"
          onPress={() => {
            setRange(history[history.length - 1]);
            setHistory(h => h.slice(0, -1));
          }}
        />
      )}
      {!saved && sentiment && history.length === 0 && (
        <Button
          secondary
          title="Change my reaction"
          onPress={() => setSentiment(null)}
        />
      )}
    </Page>
  );
}
