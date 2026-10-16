import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { AuthProvider } from '../src/state/AuthProvider';
import {
  PrototypeProvider,
  usePrototype,
  validState,
} from '../src/state/PrototypeProvider';
import { fakeServer, fakeUser } from '../testing/fakeServer';
let current: ReturnType<typeof usePrototype>;
function Probe() {
  current = usePrototype();
  return null;
}
async function mount(signedIn = false) {
  let renderer: TestRenderer.ReactTestRenderer;
  const tree = (
    <PrototypeProvider>
      <Probe />
    </PrototypeProvider>
  );
  await act(async () => {
    renderer = TestRenderer.create(signedIn ? <AuthProvider>{tree}</AuthProvider> : tree);
  });
  // Signing in swaps to that account's queue.
  await act(async () => {});
  return renderer!;
}
beforeEach(async () => {
  await AsyncStorage.clear();
  await Keychain.resetGenericPassword({ service: 'com.aux.session' });
});
test('queue changes restore after a remount', async () => {
  const renderer = await mount();
  expect(current.state.saved).toEqual([]);
  await act(async () => {
    current.toggleSaved('t5');
    current.toggleSaved('a0');
  });
  await act(async () => {
    current.unsave('t5'); // what ranking a song does to the listening queue
    current.unsave('t9'); // not saved: no change
  });
  expect(current.state.saved).toEqual(['a0']);
  const saved = current.state;
  await act(async () => renderer.unmount());
  const restored = await mount();
  expect(current.state).toEqual(saved);
  await act(async () => restored.unmount());
});
test('corrupt persisted state falls back without breaking the app', async () => {
  await AsyncStorage.setItem('@aux/queue/v5/guest', '{broken');
  const renderer = await mount();
  expect(current.error).toContain('Could not restore');
  expect(current.state.saved).toEqual([]);
  await act(async () => renderer.unmount());
});
test('older versions and unknown ids are rejected as invalid state', async () => {
  const renderer = await mount();
  const good = current.state;
  expect(validState(good)).toBe(true);
  // v4 still carried favorites, demo friends and a bio.
  expect(validState({ ...good, version: 4 })).toBe(false);
  expect(validState({ ...good, saved: ['not-a-real-id'] })).toBe(false);
  await act(async () => renderer.unmount());
});
test('leftover data from older app versions is cleared', async () => {
  await AsyncStorage.setItem('@aux/prototype/v3', '{"version":3}');
  const renderer = await mount();
  expect(await AsyncStorage.getItem('@aux/prototype/v3')).toBeNull();
  await act(async () => renderer.unmount());
});
test('the old shared queue moves to the first account that logs in', async () => {
  await AsyncStorage.setItem(
    '@aux/prototype/v4',
    JSON.stringify({
      version: 4,
      library: [],
      saved: ['t5', 'not-a-real-id'],
      favorites: ['t7'],
      connections: { 'u-maya': 'incoming' },
      bio: 'old bio',
    }),
  );
  await Keychain.setGenericPassword('armaan', 'tok', { service: 'com.aux.session' });
  globalThis.fetch = fakeServer([]).fetch as unknown as typeof fetch;
  const renderer = await mount(true);
  expect(current.state).toEqual({ version: 5, library: [], saved: ['t5'] });
  expect(await AsyncStorage.getItem('@aux/prototype/v4')).toBeNull();
  expect(
    JSON.parse((await AsyncStorage.getItem(`@aux/queue/v5/${fakeUser.id}`))!),
  ).toEqual(current.state);
  await act(async () => renderer.unmount());
});
test('enqueue adds songs to the end of the rank queue once each', async () => {
  const renderer = await mount();
  await act(async () => current.toggleSaved('a0'));
  await act(async () => {
    current.enqueue(['t5', 'a0', 't6', 't5']);
  });
  // a0 was already queued; t5 is listed twice but added once.
  expect(current.state.saved).toEqual(['a0', 't5', 't6']);
  const before = current.state;
  await act(async () => {
    current.enqueue(['t5']);
  });
  expect(current.state).toBe(before);
  await act(async () => renderer.unmount());
});
