import React from 'react';
import { AccessibilityInfo, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import App from '../App';
import { Splash, TAGLINE } from '../src/components/Splash';

// jest.setup.js swaps the splash out for every other test; this file tests the real one.
jest.unmock('../src/components/Splash');
// The real provider waits for device screen measurements, which Jest doesn't have.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

type Renderer = TestRenderer.ReactTestRenderer;
const texts = (r: Renderer) =>
  r.root
    .findAllByType(Text)
    .map(t => [t.props.children].flat().join(''))
    .join('\n');
const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
});
afterEach(() => {
  jest.useRealTimers();
});

async function show(onDone = jest.fn()) {
  let r: Renderer;
  await act(async () => {
    r = TestRenderer.create(<Splash onDone={onDone} />);
  });
  return { r: r!, onDone };
}

// Jest has no native animation driver, so the fades and slides finish instantly
// here and only the pauses take time; on a phone the whole thing is about 2s.
it('shows AUX and the tagline, holds them, then hands off to the app', async () => {
  const { r, onDone } = await show();
  expect(texts(r)).toContain('A\nU\nX');
  expect(texts(r)).toContain(TAGLINE);

  await advance(1000);
  expect(onDone).not.toHaveBeenCalled();
  await advance(1500);
  expect(onDone).toHaveBeenCalledTimes(1);
});

it('keeps it short and still with Reduce Motion on', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValueOnce(true);
  const { onDone } = await show();

  await advance(800);
  expect(onDone).not.toHaveBeenCalled();
  await advance(400);
  expect(onDone).toHaveBeenCalledTimes(1);
});

it('stops quietly if the app closes mid-animation', async () => {
  const { r, onDone } = await show();
  await advance(500);
  act(() => r.unmount());
  await advance(3000);
  expect(onDone).not.toHaveBeenCalled();
});

it('plays over the app on launch, then reveals the login screen', async () => {
  let r: Renderer;
  await act(async () => {
    r = TestRenderer.create(<App />);
  });
  await act(async () => {});
  expect(texts(r!)).toContain(TAGLINE);
  expect(texts(r!)).toContain('Log in to your');

  await advance(2500);
  expect(texts(r!)).not.toContain(TAGLINE);
  expect(texts(r!)).toContain('Log in to your');
});
