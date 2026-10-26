import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { artworkColor, colors, radii } from '../theme/theme';

interface AvatarProps {
  seed: string;
  name: string;
  size?: number;
  avatarUrl?: string | null;
}

export function Avatar({ seed, name, size = 40, avatarUrl }: AvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  if (avatarUrl && failed !== avatarUrl) return <Image accessibilityLabel={`${name} profile photo`} source={{ uri: avatarUrl }} onError={() => setFailed(avatarUrl)} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: radii.pill, backgroundColor: artworkColor(seed) },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
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
