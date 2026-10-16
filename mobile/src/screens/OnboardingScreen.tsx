import Ionicons from '@react-native-vector-icons/ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { CHART_GENRES } from '../api/charts';
import { Button, Chips, Cover, Page, palette, ui } from '../components/Kit';
import { PlaylistImporter } from '../components/PlaylistImporter';
import { useAuth } from '../state/AuthProvider';
import { usePrototype } from '../state/PrototypeProvider';
import { useCharts } from '../state/useCharts';

type Genre = (typeof CHART_GENRES)[number]['label'];
const GENRES = CHART_GENRES.map(g => g.label);

/**
 * First-run setup for a new account: import a playlist so the rank queue
 * starts full. No playlist? Pick songs from the Apple Music charts instead.
 */
export function OnboardingScreen() {
  const { user, finishOnboarding, logOut } = useAuth();
  const { state } = usePrototype();
  const [mode, setMode] = useState<'import' | 'charts'>('import');
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On success the app moves on to the Rank tab and this screen goes away.
  async function finish() {
    setFinishing(true);
    setError(null);
    try {
      await finishOnboarding();
    } catch (err) {
      setError(`Couldn’t finish setting up. ${(err as Error).message}`);
      setFinishing(false);
    }
  }

  const welcome = (
    <>
      <Text style={ui.label}>WELCOME TO AUX{user ? `, @${user.username}` : ''}</Text>
      <Text style={ui.title}>{'Start with a\nplaylist you love.'}</Text>
    </>
  );

  if (finishing || (error && state.saved.length))
    return (
      <Page>
        {welcome}
        {finishing ? (
          <View style={[ui.row, { justifyContent: 'center', minHeight: 48 }]}>
            <ActivityIndicator color={palette.ink} />
            <Text style={ui.body}>Setting up your queue…</Text>
          </View>
        ) : (
          <>
            <Text accessibilityRole="alert" style={[ui.body, { color: palette.accent }]}>
              {error}
            </Text>
            <Button title="Try again" onPress={finish} />
          </>
        )}
      </Page>
    );

  return (
    <Page>
      {mode === 'import' ? (
        <PlaylistImporter
          intro={
            <>
              {welcome}
              <Text style={ui.body}>
                Paste a link to an Apple Music or Spotify playlist. Its songs
                become your rank queue, so you can start ranking right away.
              </Text>
            </>
          }
          onAdded={finish}
          footer={
            <Pressable
              accessibilityRole="button"
              onPress={() => setMode('charts')}
              style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
            >
              <Text style={ui.link}>I don’t have a playlist</Text>
            </Pressable>
          }
        />
      ) : (
        <ChartPicker onBack={() => setMode('import')} onDone={finish} />
      )}
      {error && (
        <Text accessibilityRole="alert" style={[ui.body, { color: palette.accent }]}>
          {error}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={logOut}
        style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
      >
        <Text style={[ui.fine, { textDecorationLine: 'underline' }]}>Not you? Log out</Text>
      </Pressable>
    </Page>
  );
}

/** Pick songs you know from the Apple Music charts to fill your queue. */
function ChartPicker({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { enqueue } = usePrototype();
  const [genre, setGenre] = useState<Genre>('All genres');
  const charts = useCharts(CHART_GENRES.find(g => g.label === genre)?.id);
  const [chosen, setChosen] = useState<string[]>([]);
  const toggle = (id: string) =>
    setChosen(current =>
      current.includes(id) ? current.filter(x => x !== id) : [...current, id],
    );
  return (
    <>
      <Text style={ui.label}>NO PLAYLIST? NO PROBLEM</Text>
      <Text style={ui.title}>{'Pick songs\nyou know.'}</Text>
      <Text style={ui.body}>
        Tap the songs you’ve heard from what’s trending on Apple Music. They go
        into your rank queue.
      </Text>
      <Chips values={GENRES} value={genre} onChange={setGenre} />
      <Button
        title={chosen.length ? `Add ${chosen.length} to my queue` : 'Pick at least one song'}
        onPress={() => {
          if (!chosen.length) return;
          enqueue(chosen);
          onDone();
        }}
      />
      {charts.status === 'loading' && <ActivityIndicator color={palette.ink} />}
      {charts.status === 'error' && <Text style={ui.body}>{charts.error}</Text>}
      {charts.songs.map(s => {
        const on = chosen.includes(s.id);
        return (
          <Pressable
            key={s.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${s.title} by ${s.artist}`}
            onPress={() => toggle(s.id)}
            style={[ui.row, { paddingVertical: 4 }]}
          >
            <Ionicons
              name={on ? 'checkmark-circle' : 'ellipse-outline'}
              size={24}
              color={on ? palette.green : palette.muted}
            />
            <Cover item={s} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={ui.musicTitle} numberOfLines={1}>
                {s.title}
              </Text>
              <Text style={[ui.body, { fontSize: 13 }]} numberOfLines={1}>
                {s.artist}
              </Text>
            </View>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
      >
        <Text style={ui.link}>Import a playlist instead</Text>
      </Pressable>
    </>
  );
}
