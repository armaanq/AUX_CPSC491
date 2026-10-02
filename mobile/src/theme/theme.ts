import { Platform } from 'react-native';

export const fonts = {
  display: Platform.select<string>({ ios: 'Avenir-Black', android: 'sans-serif-black', default: 'System' }),
  heavy: Platform.select<string>({ ios: 'Avenir-Heavy', android: 'sans-serif-medium', default: 'System' }),
} as const;

export const colors = {
  background: '#F8F6F1',
  surface: '#F6F6FA',
  surfaceAlt: '#EEEEF4',
  border: '#E4E4EC',
  textPrimary: '#232822',
  textSecondary: '#75757F',
  onColor: '#FFFFFF',
  accent: '#B94D2D',
  accentMuted: '#FFE1EA',
  scoreHigh: '#1FAA59',
  scoreMid: '#E8A400',
  scoreLow: '#E8433D',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const fontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 40,
} as const;

export const cardShadow = {
  shadowColor: '#16161D',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

export function scoreColor(score: number): string {
  if (score >= 7) return colors.scoreHigh;
  if (score >= 4) return colors.scoreMid;
  return colors.scoreLow;
}

const artworkPalette = ['#7C3AED', '#DB2777', '#2563EB', '#059669', '#D97706', '#DC2626', '#0891B2'];

export function artworkColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return artworkPalette[hash % artworkPalette.length];
}
