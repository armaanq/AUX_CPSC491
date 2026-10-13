import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import { SENTIMENT_LABELS, sentimentForScore } from '../data/prototype';
import { palette, ui } from './Kit';

/** Enough slices that the gradient's steps don't show. */
const SLICES = 48;
const THUMB = 30;
/** How far one VoiceOver swipe moves the score. */
const A11Y_STEP = 0.5;
const ORANGE = [1, 3, 5].map(i => parseInt(palette.accent.slice(i, i + 2), 16));

const toTenth = (score: number) =>
  Math.round(Math.max(0, Math.min(10, score)) * 10) / 10;

/** The slider colour for a 0-10 score: white at 0, the app's orange at 10. */
export function scoreColor(score: number): string {
  const t = Math.max(0, Math.min(1, score / 10));
  const [r, g, b] = ORANGE.map(c => Math.round(255 + (c - 255) * t));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Scores a song from 0.0 to 10.0. The reaction the score falls in ("Loved it",
 * "It was fine", "Didn't like it") shows above the track.
 */
export function ScoreSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (score: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const responder = useMemo(() => {
    let startX = 0;
    const moveTo = (x: number) => {
      if (widthRef.current)
        onChangeRef.current(toTenth((x / widthRef.current) * 10));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Keep the drag when the page tries to scroll.
      onPanResponderTerminationRequest: () => false,
      // The track's children ignore touches, so locationX is always along the track.
      onPanResponderGrant: e => {
        startX = e.nativeEvent.locationX;
        moveTo(startX);
      },
      onPanResponderMove: (_, g) => moveTo(startX + g.dx),
    });
  }, []);
  const label = SENTIMENT_LABELS[sentimentForScore(value)];
  return (
    <View style={{ gap: 10 }}>
      <View style={ui.between}>
        <Text style={ui.heading}>{label}</Text>
        <Text style={[ui.title, { fontVariant: ['tabular-nums'] }]}>
          {value.toFixed(1)}
        </Text>
      </View>
      <View
        {...responder.panHandlers}
        onLayout={e => {
          widthRef.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Score"
        accessibilityValue={{ text: `${value.toFixed(1)}, ${label}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={e =>
          onChange(
            toTenth(
              value +
                (e.nativeEvent.actionName === 'increment'
                  ? A11Y_STEP
                  : -A11Y_STEP),
            ),
          )
        }
        style={{ height: 44, justifyContent: 'center' }}
      >
        <View
          style={{
            pointerEvents: 'none',
            flexDirection: 'row',
            height: 14,
            borderRadius: 7,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: palette.line,
          }}
        >
          {Array.from({ length: SLICES }, (_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                backgroundColor: scoreColor(((i + 0.5) / SLICES) * 10),
              }}
            />
          ))}
        </View>
        {width > 0 && (
          <View
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              left: (value / 10) * width - THUMB / 2,
              width: THUMB,
              height: THUMB,
              borderRadius: THUMB / 2,
              backgroundColor: scoreColor(value),
              borderWidth: 3,
              borderColor: '#FFFFFF',
              shadowColor: palette.ink,
              shadowOpacity: 0.25,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
            }}
          />
        )}
      </View>
      <View style={ui.between}>
        <Text style={ui.fine}>0.0</Text>
        <Text style={ui.fine}>10.0</Text>
      </View>
    </View>
  );
}
