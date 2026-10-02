import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RankedTrack } from '../data/types';
import { colors, fontSizes, spacing } from '../theme/theme';
import { Avatar } from './Avatar';
import { ScoreBadge } from './ScoreBadge';
import { TrackRow } from './TrackRow';

interface RankingsProfileViewProps {
  seed: string;
  name: string;
  rankings: RankedTrack[];
  headerAction?: React.ReactNode;
}

export function RankingsProfileView({ seed, name, rankings, headerAction }: RankingsProfileViewProps) {
  const average = rankings.length
    ? rankings.reduce((sum, t) => sum + t.score, 0) / rankings.length
    : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Avatar seed={seed} name={name} size={72} />
        <Text style={styles.name}>{name}</Text>
        <View style={styles.statsRow}>
          <Stat label="Logged" value={String(rankings.length)} />
          <Stat label="Avg score" value={average.toFixed(2)} />
        </View>
        {headerAction}
      </View>
      <Text style={styles.sectionTitle}>Rankings</Text>
      <FlatList
        data={rankings}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <TrackRow track={item} rank={index + 1} right={<ScoreBadge score={item.score} />} />
        )}
      />
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  name: {
    color: colors.textPrimary,
    fontSize: fontSizes.lg,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: '700',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
});
