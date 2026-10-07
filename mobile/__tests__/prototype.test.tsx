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
    current.unsave('t5'); // what ranking a song does to the listening queue
    current.unsave('t9'); // not saved: no change
    current.toggleFavorite('a0');
    current.setBio('My updated bio');
  });
  expect(current.state.connections['u-jordan']).toBe('outgoing');
  expect(current.state.connections['u-maya']).toBe('friends');
  expect(current.state.saved).not.toContain('t5');
  expect(current.state.saved).toContain('a0');
  expect(current.state.bio).toBe('My updated bio');
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
  await AsyncStorage.setItem('@aux/prototype/v4', '{broken');
  const renderer = await mount();
  expect(current.error).toContain('Could not restore');
  expect(current.state.saved).toEqual(['a0', 'a3']);
  await act(async () => renderer.unmount());
});
test('older versions and unknown ids are rejected as invalid state', async () => {
  const renderer = await mount();
  const good = current.state;
  expect(validState(good)).toBe(true);
  // v3 still carried on-device rankings; those now live on the server.
  expect(validState({ ...good, version: 3 })).toBe(false);
  expect(validState({ ...good, saved: ['not-a-real-id'] })).toBe(false);
  expect(validState({ ...good, connections: { 'u-nobody': 'friends' } })).toBe(
    false,
  );
  await act(async () => renderer.unmount());
});
test('leftover data from older app versions is cleared', async () => {
  await AsyncStorage.setItem('@aux/prototype/v3', '{"version":3}');
  const renderer = await mount();
  expect(await AsyncStorage.getItem('@aux/prototype/v3')).toBeNull();
  await act(async () => renderer.unmount());
});
