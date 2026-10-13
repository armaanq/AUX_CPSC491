import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import {
  bandOf,
  findMusic,
  insertRanking,
  isRankable,
  SENTIMENT_LABELS,
  SENTIMENT_ORDER,
  sentimentForScore,
  type Ranking,
  type Sentiment,
} from '../data/prototype';
import { usePrototype } from '../state/PrototypeProvider';
import { useRankings } from '../state/RankingsProvider';
import { chartGenreFor } from '../api/charts';
import { Button, Cover, Empty, Page, palette, ui } from '../components/Kit';
import {
  PlayableCover,
  PreviewCredit,
  useStopPreviewOnBlur,
} from '../components/PlayableCover';
import { usePreview } from '../state/PreviewProvider';
import { ScoreSlider } from '../components/ScoreSlider';
type Props = NativeStackScreenProps<RootStackParamList, 'Compare'>;
type Range = {
  lo: number;
  hi: number;
  excluded: string[];
  /** Head-to-head picks made so far; skips don't count. */
  asked: number;
};
/** Where the slider starts before you move it. */
const START_SCORE = 5;
/** Where in `songs` the one you scored closest to `score` is. */
function closestIndex(songs: Ranking[], score: number) {
  return songs.reduce(
    (best, r, i) =>
      Math.abs(r.score - score) < Math.abs(songs[best].score - score)
        ? i
        : best,
    0,
  );
}
/**
 * Genres that count as the same when comparing: chart genres group related
 * names ("Rap" with "Hip-Hop/Rap", "House" with "Dance"); any other genre
 * only matches itself. Undefined when the genre isn't known.
 */
function genreKey(genre: string | undefined) {
  const name = genre?.trim();
  if (!name || name === 'Other') return undefined;
  return chartGenreFor(name) ?? name.toLowerCase();
}
/** Each song gets a fresh flow, so "Rank the next one" starts from the slider. */
export function CompareScreen(props: Props) {
  return <RankFlow key={props.route.params.musicId} {...props} />;
}
function RankFlow({ route, navigation }: Props) {
  const { state, unsave } = usePrototype();
  const { rankings, rank, loading } = useRankings();
  const item = findMusic(route.params.musicId);
  // Snapshot of the user's other songs, taken when comparing starts so the list
  // doesn't shift under them mid-comparison. Already ordered best-first.
  const [others, setOthers] = useState<Ranking[]>([]);
  const [score, setScore] = useState(START_SCORE);
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [range, setRange] = useState<Range>({
    lo: 0,
    hi: 0,
    excluded: [],
    asked: 0,
  });
  const [history, setHistory] = useState<Range[]>([]);
  const [saved, setSaved] = useState(false);
  const committed = useRef(false);
  // Leaving, or moving on to the next song, ends the preview.
  useStopPreviewOnBlur();
  const { stop: stopPreview } = usePreview();
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
            navigation.navigate('MainTabs', { screen: 'Discover' });
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
  // Only songs in the same genre are asked about, so you never weigh a rap
  // song against a house track. A song with no known genre is compared
  // against everything.
  const genre = genreKey(item.genre);
  const peers = list
    .map((r, index) => ({ ...r, index }))
    .filter(r => !genre || genreKey(findMusic(r.musicId)?.genre) === genre);
  // Peers that could still be on either side of the new song, best first.
  const open = peers.filter(r => r.index >= range.lo && r.index < range.hi);
  // Start against the peer you scored closest to. While the new song keeps
  // winning (or losing), jump further each time: 1, 2, 4… songs. Once it has
  // both won and lost, its spot is boxed in, so split the difference.
  const won = range.hi < list.length;
  const lost = range.lo > 0;
  const jump = 2 ** Math.max(0, range.asked - 1);
  const target =
    won && lost
      ? Math.floor((open.length - 1) / 2)
      : won
      ? open.length - jump
      : lost
      ? jump - 1
      : closestIndex(open, score);
  const pivot = open
    .map((r, i) => ({ ...r, distance: Math.abs(i - target) }))
    .filter(r => !range.excluded.includes(r.musicId))
    .sort((a, b) => a.distance - b.distance)[0];
  // With no peer left to ask about, your slider score places it among the
  // songs from other genres that are still in range.
  const done = !!sentiment && !pivot;
  const position =
    range.lo +
    list.slice(range.lo, range.hi).filter(r => r.score > score).length;
  const overallRank = aboveBand + position + 1;
  const preview = sentiment
    ? insertRanking(rankings, item.id, sentiment, position).find(
        r => r.musicId === item.id,
      )
    : undefined;
  const upNext = state.saved
    .map(findMusic)
    .find(m => isRankable(m) && m.id !== item.id);
  function react() {
    const choice = sentimentForScore(score);
    const snapshot = rankings.filter(r => r.musicId !== item!.id);
    setOthers(snapshot);
    setSentiment(choice);
    setRange({
      lo: 0,
      hi: bandOf(snapshot, choice).length,
      excluded: [],
      asked: 0,
    });
    setHistory([]);
  }
  function choose(newWins: boolean) {
    stopPreview();
    if (!pivot) return;
    setHistory(h => [...h, range]);
    setRange(r => ({
      ...r,
      asked: r.asked + 1,
      ...(newWins ? { hi: pivot.index } : { lo: pivot.index + 1 }),
    }));
  }
  const bandName = sentiment ? SENTIMENT_LABELS[sentiment].toLowerCase() : '';
  const slid = score.toFixed(1);
  const makeRoom =
    'Scores across that range shift to make room, so a few may move slightly.';
  const seeLibrary = () => {
    navigation.goBack();
    navigation.navigate('MainTabs', { screen: 'Library' });
  };
  return (
    <Page>
      <View style={ui.between}>
        <Text style={ui.label}>
          {saved ? 'IN YOUR LIBRARY' : 'RANK A SONG'}
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
            <Text style={ui.body}>#{overallRank} in your library</Text>
          </View>
          {upNext ? (
            <>
              <Button
                title="Rank the next one"
                onPress={() => navigation.setParams({ musicId: upNext.id })}
              />
              <Text style={[ui.fine, { textAlign: 'center' }]}>
                Up next: {upNext.title} · {upNext.artist}
              </Text>
              <Button secondary title="See your library" onPress={seeLibrary} />
            </>
          ) : (
            <>
              <Button title="See your library" onPress={seeLibrary} />
              <Button
                secondary
                title="Find more to rank"
                onPress={() => {
                  navigation.goBack();
                  navigation.navigate('MainTabs', { screen: 'Rank' });
                }}
              />
            </>
          )}
        </>
      ) : !sentiment ? (
        <>
          <Text style={ui.title}>{'First, how did\nit land?'}</Text>
          <View style={[ui.card, ui.row]}>
            <PlayableCover item={item} size={100} />
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={ui.heading}>{item.title}</Text>
              <Text style={ui.body}>{item.artist}</Text>
            </View>
          </View>
          <PreviewCredit items={[item]} />
          <View style={ui.card}>
            <ScoreSlider value={score} onChange={setScore} />
          </View>
          <Text style={ui.body}>
            Slide to score it. Then a few head-to-head picks against
            {genre ? ` other ${item.genre}` : ''} songs you scored about the
            same find its exact spot.
          </Text>
          <Button title="Continue" onPress={react} />
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
            <Text style={ui.body}>#{overallRank} in your library</Text>
          </View>
          <Text style={ui.body}>
            {!list.length
              ? `You slid it to ${slid}. It’s your first “${bandName}” song, so it starts at the top of that range. Scores spread out as you add more.`
              : !genre
              ? `You slid it to ${slid}; where it landed among your “${bandName}” songs sets its score. ${makeRoom}`
              : !peers.length
              ? `None of your “${bandName}” songs are ${item.genre} yet, so your ${slid} placed it. ${makeRoom}`
              : `You slid it to ${slid}. Your picks against your other ${item.genre} songs set its spot, and your score placed it among other genres. ${makeRoom}`}
          </Text>
          <Button
            title="Save to my rankings"
            onPress={() => {
              if (committed.current) return;
              committed.current = true;
              rank(item.id, sentiment, position);
              unsave(item.id);
              setSaved(true);
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
            CHOICE {history.length + 1}
            {genre ? ` · ${item.genre}` : ''}
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
                <PlayableCover item={m} size={100} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Text style={ui.label}>
                    {index === 0
                      ? `YOUR NEW PICK · ${score.toFixed(1)}`
                      : `FROM YOUR LIST · ${pivot.score.toFixed(2)}`}
                  </Text>
                  <Text style={ui.heading}>{m.title}</Text>
                  <Text style={ui.body}>{m.artist}</Text>
                </View>
              </Pressable>
            </React.Fragment>
          ))}
          <PreviewCredit items={[item, findMusic(pivot.musicId)].filter(m => !!m)} />
          <Button
            secondary
            title="Haven’t heard the other one · Skip"
            onPress={() => {
              stopPreview();
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
          title="Change my score"
          onPress={() => setSentiment(null)}
        />
      )}
    </Page>
  );
}
