import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PrototypeProvider,
  usePrototype,
  validState,
} from '../src/state/PrototypeProvider';
let current: ReturnType<typeof usePrototype>;
function Probe() {
  current = usePrototype();
  return null;
}
async function mount() {
  let renderer: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <PrototypeProvider>
        <Probe />
      </PrototypeProvider>,
    );
  });
  return renderer!;
}
beforeEach(async () => {
  await AsyncStorage.clear();
});
test('requests require acceptance and all changes restore after remount', async () => {
  const renderer = await mount();
  await act(async () => {
    current.connect('u-jordan', 'request');
    current.connect('u-maya', 'accept');
    current.toggleSaved('t5');
  });
  expect(current.state.saved).toContain('t5');
  await act(async () => {
    current.rank('t5', 'FINE', 0);
    current.rank('a0', 'LOVED', 0); // albums are ignored
    current.toggleFavorite('a0');
    current.setBio('My updated bio');
  });
  expect(current.state.connections['u-jordan']).toBe('outgoing');
  expect(current.state.connections['u-maya']).toBe('friends');
  expect(current.state.saved).not.toContain('t5');
  expect(current.state.saved).toContain('a0');
  expect(current.state.rankings.some(r => r.musicId === 'a0')).toBe(false);
  expect(current.state.rankings.find(r => r.musicId === 't5')).toEqual({
    musicId: 't5',
    sentiment: 'FINE',
    score: 6.66,
  });
  await act(async () => {
    current.connect('u-jordan', 'accept');
  });
  expect(current.state.connections['u-jordan']).toBe('outgoing');
  const saved = current.state;
  await act(async () => renderer.unmount());
  const restored = await mount();
  expect(current.state).toEqual(saved);
  await act(async () => {
    current.connect('u-jordan', 'remove');
  });
  expect(current.state.connections['u-jordan']).toBeUndefined();
  await act(async () => restored.unmount());
});
test('corrupt persisted state falls back without breaking the app', async () => {
  await AsyncStorage.setItem('@aux/prototype/v3', '{broken');
  const renderer = await mount();
  expect(current.error).toContain('Could not restore');
  expect(current.state.rankings.length).toBeGreaterThan(0);
  expect(validState({ version: 1, rankings: [] })).toBe(false);
  await act(async () => renderer.unmount());
});
test('an album or a ranking without a reaction is rejected as invalid state', async () => {
  const renderer = await mount();
  const good = current.state;
  expect(validState(good)).toBe(true);
  expect(
    validState({
      ...good,
      rankings: [{ musicId: 'a0', sentiment: 'LOVED', score: 9 }],
    }),
  ).toBe(false);
  expect(validState({ ...good, rankings: [{ musicId: 't1', score: 9 }] })).toBe(
    false,
  );
  await act(async () => renderer.unmount());
});
