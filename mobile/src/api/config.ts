import { Platform } from 'react-native';

// Set to true while you're changing server/ code, to use your own
// `npm run start:dev` instead of the shared server. Don't commit it as true.
// Only debug builds read it; release builds always use the shared server.
const USE_LOCAL_SERVER: boolean = false;

// The shared AUX server on Render. It redeploys whenever main changes.
const SHARED_SERVER = 'https://aux-server-cqre.onrender.com';

// Your own server (server/, `npm run start:dev`):
// - iOS Simulator: localhost works because it shares your Mac's network.
// - Android emulator: 10.0.2.2 is the emulator's name for your Mac.
const LOCAL_SERVER =
  Platform.select({
    android: 'http://10.0.2.2:3000',
    default: 'http://localhost:3000',
  }) ?? 'http://localhost:3000';

export const USING_LOCAL_SERVER = __DEV__ && USE_LOCAL_SERVER;
export const API_BASE_URL = USING_LOCAL_SERVER ? LOCAL_SERVER : SHARED_SERVER;
