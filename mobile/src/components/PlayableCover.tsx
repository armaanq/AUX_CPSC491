import React, { useContext, useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { NavigationContext } from '@react-navigation/native';
import type { Music } from '../data/prototype';
import { usePreview } from '../state/PreviewProvider';
import { Cover, palette, ui } from './Kit';

/** Previews come from Apple Music, which asks apps to say so. */
export const PREVIEW_CREDIT = 'Previews courtesy of Apple Music';

/** Songs that might have a preview: catalog songs, not albums or demo data. */
export function canPreview(item: Music) {
  return (
    item.kind === 'song' &&
    ((item.source === 'apple' && !!item.externalId) || !!item.isrc)
  );
}

/**
 * A cover with a play/pause button in its corner and a progress line along
 * its bottom edge while the preview plays. Falls back to a plain cover for
 * anything that can't have a preview.
 */
export function PlayableCover({ item, size }: { item: Music; size: number }) {
  const { toggle, statusOf, current, progress } = usePreview();
  if (!canPreview(item)) return <Cover item={item} size={size} />;

  const status = statusOf(item.id);
  const active = current?.musicId === item.id;
  const button = Math.max(34, Math.round(size * 0.26));
  const unavailable = status === 'unavailable';
  const label =
    status === 'playing'
      ? `Pause the preview of ${item.title}`
      : status === 'paused'
      ? `Resume the preview of ${item.title}`
      : status === 'loading'
      ? `Loading the preview of ${item.title}`
      : unavailable
      ? `No preview for ${item.title}`
      : status === 'error'
      ? `Preview of ${item.title} didn’t play. Try again`
      : `Play a preview of ${item.title}`;

  return (
    <View style={{ width: size, height: size }}>
      <Cover item={item} size={size} />
      {active && (status === 'playing' || status === 'paused') && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 4,
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 10,
            overflow: 'hidden',
            backgroundColor: 'rgba(0,0,0,0.25)',
          }}
        >
          <View
            style={{
              width: `${Math.round(progress * 100)}%`,
              height: '100%',
              backgroundColor: '#FFFFFF',
            }}
          />
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: unavailable, busy: status === 'loading' }}
        disabled={unavailable}
        hitSlop={8}
        onPress={() => toggle(item)}
        style={({ pressed }) => ({
          position: 'absolute',
          right: 8,
          bottom: 10,
          width: button,
          height: button,
          borderRadius: button / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: unavailable ? 'rgba(35,40,34,0.45)' : palette.ink,
          opacity: pressed ? 0.8 : 1,
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        })}
      >
        {status === 'loading' ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Ionicons
            name={
              status === 'playing'
                ? 'pause'
                : unavailable
                ? 'volume-mute'
                : status === 'error'
                ? 'refresh'
                : 'play'
            }
            size={button * 0.48}
            color="#FFFFFF"
            // The play triangle looks off-center when it's centered exactly.
            style={status === 'idle' || status === 'paused' ? { marginLeft: 3 } : undefined}
          />
        )}
      </Pressable>
    </View>
  );
}

/** The credit line, shown once a preview has been tried on this screen. */
export function PreviewCredit({ items }: { items: Music[] }) {
  const { current } = usePreview();
  const shown = items.some(m => current?.musicId === m.id);
  if (!shown) return null;
  return (
    <Text style={[ui.fine, { textAlign: 'center' }]}>
      {current?.status === 'unavailable'
        ? 'Apple Music doesn’t have a preview of this one.'
        : current?.status === 'error'
        ? 'The preview didn’t play. Check your connection and tap again.'
        : PREVIEW_CREDIT}
    </Text>
  );
}

/** Stops the preview when the user leaves the screen (or it unmounts). */
export function useStopPreviewOnBlur() {
  const { stop } = usePreview();
  // Read the context directly so screens still render in tests without a navigator.
  const navigation = useContext(NavigationContext);
  useEffect(() => {
    const unsubscribe = navigation?.addListener('blur', stop);
    return () => {
      unsubscribe?.();
      stop();
    };
  }, [navigation, stop]);
}
