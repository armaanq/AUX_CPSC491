import React, { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type Music } from '../data/prototype';
import { usePrototype } from '../state/PrototypeProvider';
export const palette = {
  paper: '#F8F6F1',
  ink: '#232822',
  muted: '#73786F',
  accent: '#B94D2D',
  soft: '#ECEAE3',
  line: '#DEDCD4',
  green: '#386349',
};
export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.paper },
  content: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 36,
    gap: 22,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1.5,
    color: palette.ink,
  },
  heading: {
    fontSize: 23,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: palette.ink,
  },
  body: { fontSize: 15, lineHeight: 22, color: palette.muted },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: palette.accent,
  },
  card: {
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.line,
    gap: 14,
  },
  input: {
    backgroundColor: palette.soft,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    color: palette.ink,
    fontSize: 16,
    minHeight: 48,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 17,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: palette.soft,
    justifyContent: 'center',
  },
  selected: { backgroundColor: palette.ink },
  chipText: { fontSize: 13, fontWeight: '700', color: palette.ink },
  white: { color: '#FFFFFF' },
  button: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  link: { color: palette.accent, fontSize: 14, fontWeight: '700' },
  musicTitle: { fontSize: 16, fontWeight: '700', color: palette.ink },
  divider: { height: 1, backgroundColor: palette.line },
});
export function Page({
  children,
  insetTop = true,
}: {
  children: React.ReactNode;
  insetTop?: boolean;
}) {
  const { error } = usePrototype();
  return (
    <SafeAreaView style={ui.page} edges={insetTop ? ['top'] : []}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={ui.content}
      >
        {error && (
          <Text accessibilityRole="alert" style={ui.body}>
            {error}
          </Text>
        )}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        ui.button,
        secondary && { backgroundColor: palette.soft },
        { opacity: pressed ? 0.65 : 1 },
      ]}
    >
      <Text style={[ui.buttonText, secondary && { color: palette.ink }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Chips<T extends string>({
  values,
  value,
  onChange,
}: {
  values: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      {values.map(v => (
        <Pressable
          key={v}
          accessibilityRole="button"
          accessibilityState={{ selected: value === v }}
          onPress={() => onChange(v)}
          style={[ui.chip, value === v && ui.selected]}
        >
          <Text style={[ui.chipText, value === v && ui.white]}>{v}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
export function Cover({ item, size = 60 }: { item: Music; size?: number }) {
  const [failed, setFailed] = useState(false);
  return item.artwork && !failed ? (
    <Image
      accessibilityLabel={`${item.title} cover`}
      source={{ uri: item.artwork }}
      onError={() => setFailed(true)}
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        backgroundColor: palette.soft,
      }}
    />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: item.genre === 'R&B' ? '#A37760' : '#627360',
        borderRadius: 10,
        padding: size * 0.12,
        justifyContent: 'space-between',
      }}
    >
      <Text
        style={{ color: '#FFFFFF', fontWeight: '800', fontSize: size * 0.22 }}
      >
        AUX
      </Text>
      <Text
        numberOfLines={2}
        style={{ color: '#FFFFFF', fontSize: Math.max(9, size * 0.09) }}
      >
        {item.title}
      </Text>
    </View>
  );
}
export function MusicRow({
  item,
  onPress,
  detail,
  score,
  rank,
}: {
  item: Music;
  onPress: () => void;
  detail?: string;
  score?: number;
  rank?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.artist}${
        score !== undefined ? `, score ${score}` : ''
      }`}
      onPress={onPress}
      style={[ui.row, { paddingVertical: 8 }]}
    >
      {rank !== undefined && (
        <Text style={[ui.body, { width: 20 }]}>{rank}</Text>
      )}
      <Cover item={item} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={ui.musicTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[ui.body, { fontSize: 13 }]} numberOfLines={1}>
          {detail || item.artist}
        </Text>
      </View>
      {score !== undefined ? (
        <Text style={{ color: palette.green, fontWeight: '800', fontSize: 20 }}>
          {score.toFixed(2)}
        </Text>
      ) : (
        <Text style={ui.body}>↗</Text>
      )}
    </Pressable>
  );
}
export function Shelf({
  items,
  onPress,
}: {
  items: Music[];
  onPress: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 16 }}
    >
      {items.map(item => (
        <Pressable
          accessibilityRole="button"
          key={item.id}
          onPress={() => onPress(item.id)}
          style={{ width: 140, gap: 7 }}
        >
          <Cover item={item} size={140} />
          <Text style={ui.musicTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[ui.body, { fontSize: 12 }]} numberOfLines={1}>
            {item.artist}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <View style={ui.card}>
      <Text style={ui.heading}>{title}</Text>
      <Text style={ui.body}>{body}</Text>
    </View>
  );
}
