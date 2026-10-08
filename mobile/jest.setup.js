// Jest provides this global when loading the setup file.
// eslint-disable-next-line no-undef
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The launch animation runs on timers, so tests that render <App /> skip it.
// __tests__/splash.test.tsx covers the real one.
// eslint-disable-next-line no-undef
jest.mock('./src/components/Splash', () => ({ Splash: () => null }));
