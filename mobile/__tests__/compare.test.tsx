import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CompareScreen } from '../src/screens/CompareScreen';
import {
  PrototypeProvider,
  usePrototype,
} from '../src/state/PrototypeProvider';

let current: ReturnType<typeof usePrototype>;
function Probe() {
  current = usePrototype();
  return null;
}
const nav = { goBack: jest.fn(), navigate: jest.fn() } as any;

async function open(musicId: string) {
  let r: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <PrototypeProvider>
          <Probe />
          <CompareScreen
            route={{ key: 'c', name: 'Compare', params: { musicId } }}
            navigation={nav}
          />
        </PrototypeProvider>
      </SafeAreaProvider>,
    );
  });
  return r!;
}
const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(Text)
    .map(t => [t.props.children].flat().join(''))
    .join('\n');
const press = async (r: TestRenderer.ReactTestRenderer, label: string) => {
  const target = r.root
    .findAll(n => typeof n.props.onPress === 'function')
    .find(n => texts({ root: n } as any).includes(label));
  if (!target) throw new Error(`No button "${label}"`);
  await act(async () => target.props.onPress());
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('asks for a reaction first, then saves into that band', async () => {
  const r = await open('t5');
  expect(texts(r)).toContain('First, how did');
  await press(r, 'It was fine');
  // Keep picking the existing song until the new one reaches the bottom.
  while (texts(r).includes('Which stays')) await press(r, 'FROM YOUR LIST');
  expect(texts(r)).toContain('Found its place.');
  await press(r, 'Save to my rankings');
  const saved = current.state.rankings.find(x => x.musicId === 't5')!;
  expect(saved.sentiment).toBe('FINE');
  expect(saved.score).toBeGreaterThanOrEqual(3.34);
  expect(saved.score).toBeLessThanOrEqual(6.66);
  await act(async () => r.unmount());
});

test('albums show a message instead of the ranking flow', async () => {
  const r = await open('a0');
  expect(texts(r)).toContain('Only songs can be ranked');
  await act(async () => r.unmount());
});
