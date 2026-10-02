import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSizes, radii, scoreColor, spacing } from '../theme/theme';

interface ScoreBadgeProps {
  score: number;
}

export function ScoreBadge({ score }: ScoreBadgeProps) {
  return (
    <View style={[styles.container, { backgroundColor: scoreColor(score) }]}>
      <Text style={styles.text}>{score.toFixed(2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    minWidth: 44,
    alignItems: 'center',
  },
  text: {
    fontSize: fontSizes.sm,
    fontWeight: '800',
    color: colors.onColor,
  },
});
