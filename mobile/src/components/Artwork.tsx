import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { artworkColor, colors, radii } from '../theme/theme';

interface ArtworkProps {
  seed: string;
  title: string;
  size?: number;
}

export function Artwork({ seed, title, size = 56 }: ArtworkProps) {
  const initial = title.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: radii.sm, backgroundColor: artworkColor(seed) },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: colors.onColor,
    fontWeight: '700',
  },
});
