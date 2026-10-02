import { Platform } from 'react-native';

// Where the AUX server (server/, `npm run start:dev`) is running.
//
// - iOS Simulator: localhost works because it shares your Mac's network.
// - Android emulator: 10.0.2.2 is the emulator's name for your Mac.
// - A physical phone: localhost means the phone itself, so use your Mac's
//   Wi-Fi IP instead (System Settings → Wi-Fi → Details → IP address),
//   e.g. 'http://192.168.1.23:3000', with both on the same Wi-Fi.
export const API_BASE_URL =
  Platform.select({
    android: 'http://10.0.2.2:3000',
    default: 'http://localhost:3000',
  }) ?? 'http://localhost:3000';
