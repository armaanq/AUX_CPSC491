/**
 * AUX mobile app
 *
 * @format
 */

import 'react-native-gesture-handler';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/state/AuthProvider';
import { PrototypeProvider } from './src/state/PrototypeProvider';
import { RankingsProvider } from './src/state/RankingsProvider';
import { RootNavigator } from './src/navigation/RootNavigator';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AuthProvider>
        <RankingsProvider>
          <PrototypeProvider>
            <RootNavigator />
          </PrototypeProvider>
        </RankingsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default App;
