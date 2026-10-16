import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { Button, Page, Shelf, palette, scoreTone, ui } from '../components/Kit';
import {
  findMusic,
  SENTIMENT_LABELS,
  SENTIMENT_ORDER,
  type Ranking,
} from '../data/prototype';
import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthProvider';
import { useFriends } from '../state/FriendsProvider';
import { usePrototype } from '../state/PrototypeProvider';
import { useRankings } from '../state/RankingsProvider';
import { useSongStats } from '../state/useSongStats';

const BAND_COLORS = { LOVED: palette.green, FINE: '#C9A35A', DISLIKED: palette.accent };

/** The most common values, most first: [["Frank Ocean", 4], …]. */
export function tally(values: string[], top = 5): [string, number][] {
  const counts = new Map<string, number>();
  values.forEach(v => v && counts.set(v, (counts.get(v) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
}

export function averageScore(rankings: Ranking[]): number | null {
  if (!rankings.length) return null;
  return rankings.reduce((sum, r) => sum + r.score, 0) / rankings.length;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text
        style={{
          fontSize: 26,
          fontWeight: '800',
          letterSpacing: -0.8,
          color: palette.ink,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
      <Text style={[ui.fine, { textAlign: 'center' }]}>{label}</Text>
    </View>
  );
}

function Bars({ rows }: { rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return (
    <View style={{ gap: 8 }}>
      {rows.map(([name, count]) => (
        <View key={name} style={{ gap: 3 }}>
          <View style={ui.between}>
            <Text style={[ui.musicTitle, { fontSize: 14, flex: 1 }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={ui.fine}>{count}</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: palette.soft }}>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                width: `${(count / max) * 100}%`,
                backgroundColor: palette.ink,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Your account and the numbers behind your taste. Opened from the top-right avatar. */
export function ProfileScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logOut, saveBio } = useAuth();
  const { state } = usePrototype();
  const { rankings } = useRankings();
  const [editing, setEditing] = useState(false);
  const bio = user?.bio ?? '';
  const [draft, setDraft] = useState(bio);
  const [saving, setSaving] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);

  const items = rankings.map(r => ({ ...r, item: findMusic(r.musicId) })).filter(r => r.item);
  const avg = averageScore(rankings);
  const friends = useFriends().friends.length;
  const bands = SENTIMENT_ORDER.map(s => ({
    sentiment: s,
    count: rankings.filter(r => r.sentiment === s).length,
  }));
  const genres = tally(items.map(r => r.item.genre));
  const artists = tally(items.map(r => r.item.artist));

  // How close your scores sit to AUX's average, on songs other people ranked too.
  const stats = useSongStats(items.map(r => r.item.songId));
  const shared = items.flatMap(r => {
    const s = r.item.songId ? stats[r.item.songId] : null;
    return s && s.listeners > 1 ? [Math.abs(r.score - s.averageScore)] : [];
  });
  const inTune = shared.length
    ? Math.round(100 * (1 - shared.reduce((a, b) => a + b, 0) / shared.length / 10))
    : null;
  const since = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;
  const name = user?.username ?? '';
  const open = (musicId: string) => nav.navigate('MusicDetail', { musicId });

  return (
    <Page insetTop={false}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Avatar seed="me" name={name} size={84} />
        <Text style={[ui.title, { fontSize: 30 }]}>@{name}</Text>
        {since && <Text style={ui.fine}>On AUX since {since}</Text>}
      </View>

      {editing ? (
        <View style={{ gap: 10 }}>
          <TextInput
            accessibilityLabel="Profile bio"
            multiline
            maxLength={160}
            value={draft}
            onChangeText={setDraft}
            style={ui.input}
          />
          {bioError && (
            <Text accessibilityRole="alert" style={[ui.body, { color: palette.accent }]}>
              {bioError}
            </Text>
          )}
          <Button
            title={saving ? 'Saving…' : 'Save bio'}
            onPress={async () => {
              if (saving) return;
              setSaving(true);
              try {
                await saveBio(draft.trim());
                setBioError(null);
                setEditing(false);
              } catch (err) {
                setBioError(`Couldn't save your bio. ${(err as Error).message}`);
              } finally {
                setSaving(false);
              }
            }}
          />
          <Button
            secondary
            title="Cancel"
            onPress={() => {
              setBioError(null);
              setEditing(false);
            }}
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Edit your bio"
          onPress={() => {
            setDraft(bio);
            setEditing(true);
          }}
          style={{ alignItems: 'center', minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={[ui.body, { textAlign: 'center' }]}>
            {bio || 'Add a bio'}
          </Text>
          <Text style={[ui.link, { fontSize: 12 }]}>Edit</Text>
        </Pressable>
      )}

      <View style={[ui.card, { flexDirection: 'row', gap: 4 }]}>
        <Stat value={String(rankings.length)} label="songs ranked" />
        <Stat value={avg === null ? '—' : avg.toFixed(2)} label="average score" />
        <Stat value={String(state.saved.length)} label="in queue" />
        <Stat value={String(friends)} label={friends === 1 ? 'friend' : 'friends'} />
      </View>

      <View style={ui.card}>
        <Text style={ui.label}>HOW YOU REACT</Text>
        {rankings.length ? (
          <>
            <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden' }}>
              {bands
                .filter(b => b.count)
                .map(b => (
                  <View
                    key={b.sentiment}
                    style={{ flex: b.count, backgroundColor: BAND_COLORS[b.sentiment] }}
                  />
                ))}
            </View>
            {bands.map(b => (
              <View key={b.sentiment} style={ui.between}>
                <View style={ui.row}>
                  <View
                    style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: BAND_COLORS[b.sentiment] }}
                  />
                  <Text style={ui.body}>{SENTIMENT_LABELS[b.sentiment]}</Text>
                </View>
                <Text style={ui.musicTitle}>
                  {b.count}
                  <Text style={ui.fine}>
                    {'  '}
                    {Math.round((100 * b.count) / rankings.length)}%
                  </Text>
                </Text>
              </View>
            ))}
          </>
        ) : (
          <Text style={ui.body}>Rank a few songs to see your mix.</Text>
        )}
      </View>

      <View style={[ui.card, { backgroundColor: '#E8EDE5', borderColor: '#E8EDE5' }]}>
        <Text style={ui.label}>YOU VS. AUX</Text>
        <Text
          style={[
            ui.title,
            { fontSize: 32, color: inTune === null ? palette.muted : scoreTone(inTune / 10) },
          ]}
        >
          {inTune === null ? 'Not enough overlap yet' : `${inTune}% in tune`}
        </Text>
        <Text style={ui.body}>
          {inTune === null
            ? 'Once other people rank songs you’ve ranked, this shows how closely your scores match theirs.'
            : `Based on ${shared.length} ${shared.length === 1 ? 'song' : 'songs'} other people ranked too. 100% means your scores match AUX’s average exactly.`}
        </Text>
      </View>

      {genres.length > 0 && (
        <View style={ui.card}>
          <Text style={ui.label}>TOP GENRES</Text>
          <Bars rows={genres} />
        </View>
      )}
      {artists.length > 0 && (
        <View style={ui.card}>
          <Text style={ui.label}>MOST-RANKED ARTISTS</Text>
          <Bars rows={artists} />
        </View>
      )}

      {items.length > 0 && (
        <>
          <Text style={ui.heading}>Your top 10</Text>
          <Shelf items={items.slice(0, 10).map(r => r.item)} onPress={open} />
        </>
      )}

      <Button
        secondary
        title="Log out"
        onPress={() =>
          Alert.alert('Log out of AUX?', `You're logged in as @${name}.`, [
            { text: 'Stay logged in', style: 'cancel' },
            { text: 'Log out', style: 'destructive', onPress: logOut },
          ])
        }
      />
    </Page>
  );
}
