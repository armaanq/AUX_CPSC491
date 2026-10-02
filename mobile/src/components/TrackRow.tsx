import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Track } from '../data/types';
import { colors, fontSizes, spacing } from '../theme/theme';
import { Artwork } from './Artwork';

interface TrackRowProps {
  track: Track;
  rank?: number;
  right?: React.ReactNode;
  onPress?: () => void;
}

export function TrackRow({ track, rank, right, onPress }: TrackRowProps) {
  const Container = onPress ? TouchableOpacity : View;
  return (
    <Container style={styles.row} onPress={onPress} activeOpacity={0.7}>
      {rank !== undefined && <Text style={styles.rank}>{rank}</Text>}
      <Artwork seed={track.id} title={track.title} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {track.artist} · {track.albumTitle}
        </Text>
      </View>
      {right}
    </Container>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  rank: {
    width: 20,
    textAlign: 'center',
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: fontSizes.sm,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
});
