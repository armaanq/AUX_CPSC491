import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import { palette } from './Kit';

const LETTERS = ['A', 'U', 'X'];
export const TAGLINE = 'For Music Lovers, By Music Lovers';

/**
 * Plays over the app at launch: "AUX" rises in letter by letter, an accent
 * line draws under it, then the tagline. The app (and the saved-login check)
 * loads underneath, so the animation doesn't add to startup time.
 * The iOS launch screen is the same plain paper color, so the hand-off is seamless.
 */
export function Splash({ onDone }: { onDone: () => void }) {
  const letters = useRef(LETTERS.map(() => new Animated.Value(0))).current;
  const line = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const finish = useRef(onDone);
  finish.current = onDone;

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    const to = (value: Animated.Value, duration: number, toValue = 1) =>
      Animated.timing(value, {
        toValue,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });

    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then(reduceMotion => {
        if (cancelled) return;
        if (reduceMotion) {
          // Nothing moves: show it all at once, then fade.
          [...letters, line, tagline].forEach(v => v.setValue(1));
          animation = Animated.sequence([Animated.delay(900), to(fade, 200, 0)]);
        } else {
          animation = Animated.sequence([
            Animated.parallel([
              Animated.stagger(
                110,
                letters.map(v => to(v, 500)),
              ),
              Animated.sequence([Animated.delay(350), to(line, 450)]),
              Animated.sequence([Animated.delay(650), to(tagline, 450)]),
            ]),
            Animated.delay(700),
            to(fade, 300, 0),
          ]);
        }
        animation.start(({ finished }) => {
          if (finished) finish.current();
        });
      });
    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [letters, line, tagline, fade]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.screen, { opacity: fade }]}
      accessible
      accessibilityViewIsModal
      accessibilityLabel={`AUX. ${TAGLINE}`}
    >
      <View style={styles.word}>
        {LETTERS.map((letter, i) => (
          <Animated.Text
            key={letter}
            style={[styles.letter, rise(letters[i], 18)]}
          >
            {letter}
          </Animated.Text>
        ))}
      </View>
      <Animated.View style={[styles.line, { transform: [{ scaleX: line }] }]} />
      <Animated.Text style={[styles.tagline, rise(tagline, 8)]}>
        {TAGLINE}
      </Animated.Text>
    </Animated.View>
  );
}

/** Fades in while sliding up from `distance` points below. */
function rise(value: Animated.Value, distance: number) {
  return {
    opacity: value,
    transform: [
      {
        translateY: value.interpolate({
          inputRange: [0, 1],
          outputRange: [distance, 0],
        }),
      },
    ],
  };
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    backgroundColor: palette.paper,
  },
  word: { flexDirection: 'row', gap: 10 },
  letter: { fontSize: 64, fontWeight: '900', color: palette.ink },
  line: {
    width: 56,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.accent,
  },
  tagline: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: palette.muted,
  },
});
