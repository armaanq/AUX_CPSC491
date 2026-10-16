import Ionicons from '@react-native-vector-icons/ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { importPlaylist, looksLikePlaylistLink, type PlaylistImport } from '../api/playlists';
import { Button, Cover, Empty, SectionHeader, palette, ui } from './Kit';
import { musicFromSearch, registerMusic, type Music } from '../data/prototype';
import { usePrototype } from '../state/PrototypeProvider';
import { useRankings } from '../state/RankingsProvider';

type Status =
  | { step: 'idle' }
  | { step: 'loading' }
  | { step: 'error'; message: string }
  | { step: 'preview'; result: PlaylistImport; songs: Music[] }
  | { step: 'added'; count: number; name: string };

const PROVIDER_NAMES = { apple: 'Apple Music', spotify: 'Spotify' } as const;

/**
 * Paste an Apple Music or Spotify playlist link; AUX finds each song in its
 * catalog and you choose which go into your rank queue. Used by the Add tab
 * and by first-run setup.
 */
export function PlaylistImporter({
  intro,
  footer,
  addedAction,
  onAdded,
  onSearchMissing,
}: {
  /** Shown above the link box (not while choosing songs). */
  intro: React.ReactNode;
  /** Shown below the "where to find the link" card (not while choosing songs). */
  footer?: React.ReactNode;
  /** What to offer once songs are queued, e.g. a "Start ranking" button. */
  addedAction?: React.ReactNode;
  onAdded?: (count: number, name: string) => void;
  /** Lets each unmatched song open a search; left off, they're listed only. */
  onSearchMissing?: (query: string) => void;
}) {
  const { state, enqueue } = usePrototype();
  const { rankings } = useRankings();
  const [link, setLink] = useState('');
  const [status, setStatus] = useState<Status>({ step: 'idle' });
  // Songs unticked in the preview.
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [showMissing, setShowMissing] = useState(false);

  const ranked = new Set(rankings.map(r => r.musicId));
  const queued = new Set(state.saved);

  async function read() {
    const url = link.trim();
    if (!looksLikePlaylistLink(url)) {
      setStatus({
        step: 'error',
        message: 'That doesn’t look like a playlist link. Use Share › Copy Link in Apple Music or Spotify.',
      });
      return;
    }
    setStatus({ step: 'loading' });
    try {
      const result = await importPlaylist(url);
      const songs = result.tracks.map(musicFromSearch);
      registerMusic(songs);
      // Songs you've already ranked or queued start unticked.
      setSkipped(new Set(songs.filter(s => ranked.has(s.id) || queued.has(s.id)).map(s => s.id)));
      setShowMissing(false);
      setStatus({ step: 'preview', result, songs });
    } catch (err) {
      setStatus({ step: 'error', message: (err as Error).message });
    }
  }

  const toggle = (id: string) =>
    setSkipped(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const preview = status.step === 'preview' ? status : null;
  const chosen = preview ? preview.songs.filter(s => !skipped.has(s.id)) : [];

  if (!preview)
    return (
      <>
        {intro}
        <TextInput
          accessibilityLabel="Playlist link"
          placeholder="https://music.apple.com/…/playlist/…"
          placeholderTextColor={palette.muted}
          value={link}
          onChangeText={text => {
            setLink(text);
            if (status.step === 'error' || status.step === 'added') setStatus({ step: 'idle' });
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={read}
          style={ui.input}
        />
        {status.step === 'loading' ? (
          <View style={[ui.row, { justifyContent: 'center', minHeight: 48 }]}>
            <ActivityIndicator color={palette.ink} />
            <Text style={ui.body}>Reading the playlist… big ones take a few seconds.</Text>
          </View>
        ) : (
          <Button title="Find the songs" onPress={read} />
        )}
        {status.step === 'error' && (
          <Text accessibilityRole="alert" style={[ui.body, { color: palette.accent }]}>
            {status.message}
          </Text>
        )}
        {status.step === 'added' && (
          <View style={[ui.card, { backgroundColor: '#E8EDE5', borderColor: '#E8EDE5' }]}>
            <Text style={ui.label}>ADDED TO YOUR QUEUE</Text>
            <Text style={ui.heading}>
              {status.count} {status.count === 1 ? 'song' : 'songs'} from “{status.name}”
            </Text>
            {addedAction}
          </View>
        )}
        <View style={ui.card}>
          <Text style={ui.musicTitle}>Where to find the link</Text>
          <View style={ui.row}>
            <Ionicons name="logo-apple" size={18} color={palette.ink} />
            <Text style={[ui.body, { flex: 1 }]}>
              Apple Music: open the playlist › ••• › Share › Copy Link. Personal
              playlists need “Show on My Profile” turned on.
            </Text>
          </View>
          <View style={ui.row}>
            <Ionicons name="musical-notes" size={18} color={palette.ink} />
            <Text style={[ui.body, { flex: 1 }]}>
              Spotify: playlist › ••• › Share › Copy link to playlist. It must
              be public. AUX matches each song to Apple Music by title and
              artist, and shows anything it couldn’t match.
            </Text>
          </View>
        </View>
        {footer}
      </>
    );

  return (
    <>
      <View style={ui.between}>
        <View style={{ flex: 1 }}>
          <Text style={ui.label}>FROM {PROVIDER_NAMES[preview.result.provider].toUpperCase()}</Text>
          <Text style={[ui.heading, { fontSize: 26 }]} numberOfLines={2}>
            {preview.result.name}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setStatus({ step: 'idle' })}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={ui.link}>Cancel</Text>
        </Pressable>
      </View>
      <Text style={ui.body}>
        Found {preview.songs.length} {preview.songs.length === 1 ? 'song' : 'songs'}
        {preview.result.unmatched.length
          ? ` · ${preview.result.unmatched.length} couldn’t be matched`
          : ''}
        {preview.result.truncated ? ' · only the first part of this long playlist was read' : ''}
        . Untick anything you haven’t heard.
      </Text>
      <View style={ui.row}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSkipped(new Set())}
          style={{ minHeight: 40, justifyContent: 'center' }}
        >
          <Text style={ui.link}>Select all</Text>
        </Pressable>
        <Text style={ui.body}>·</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSkipped(new Set(preview.songs.map(s => s.id)))}
          style={{ minHeight: 40, justifyContent: 'center' }}
        >
          <Text style={ui.link}>Select none</Text>
        </Pressable>
      </View>
      <Button
        title={
          chosen.length
            ? `Add ${chosen.length} to rank queue`
            : 'Pick at least one song'
        }
        onPress={() => {
          if (!chosen.length) return;
          enqueue(chosen.map(s => s.id));
          setStatus({ step: 'added', count: chosen.length, name: preview.result.name });
          setLink('');
          onAdded?.(chosen.length, preview.result.name);
        }}
      />
      {preview.songs.map(s => {
        const on = !skipped.has(s.id);
        const note = ranked.has(s.id)
          ? 'Already ranked'
          : queued.has(s.id)
          ? 'Already in your queue'
          : s.artist;
        return (
          <Pressable
            key={s.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${s.title} by ${s.artist}`}
            onPress={() => toggle(s.id)}
            style={[ui.row, { paddingVertical: 4, opacity: on ? 1 : 0.5 }]}
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
                {note}
              </Text>
            </View>
          </Pressable>
        );
      })}
      {!preview.songs.length && (
        <Empty
          title="No songs we could match"
          body="Try another playlist, or search for songs one at a time."
        />
      )}
      {preview.result.unmatched.length > 0 && (
        <>
          <SectionHeader
            title="Couldn’t match"
            action={showMissing ? 'Hide' : `Show ${preview.result.unmatched.length}`}
            onAction={() => setShowMissing(v => !v)}
          />
          {showMissing &&
            preview.result.unmatched.map((u, i) => (
              <Pressable
                key={`${u.title}-${i}`}
                accessibilityRole="button"
                accessibilityLabel={`Search for ${u.title}`}
                disabled={!onSearchMissing}
                onPress={() => onSearchMissing?.(`${u.title} ${u.artist}`.trim())}
                style={[ui.between, { paddingVertical: 6 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={ui.musicTitle} numberOfLines={1}>
                    {u.title}
                  </Text>
                  <Text style={[ui.body, { fontSize: 13 }]} numberOfLines={1}>
                    {u.artist}
                  </Text>
                </View>
                {onSearchMissing && <Text style={ui.link}>Search ↗</Text>}
              </Pressable>
            ))}
        </>
      )}
      <Text style={ui.fine}>
        Song details from Apple Music
        {preview.result.provider === 'spotify'
          ? ' · playlist read from Spotify’s public page'
          : ''}
      </Text>
    </>
  );
}
