/**
 * AUX mobile app
 *
 * @format
 */

import 'react-native-gesture-handler';
import { useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Splash } from './src/components/Splash';
import { AuthProvider } from './src/state/AuthProvider';
import { PrototypeProvider } from './src/state/PrototypeProvider';
import { PreviewProvider } from './src/state/PreviewProvider';
import { RankingsProvider } from './src/state/RankingsProvider';
import { RootNavigator } from './src/navigation/RootNavigator';

function App() {
  const [splash, setSplash] = useState(true);
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AuthProvider>
        <RankingsProvider>
          <PrototypeProvider>
            <PreviewProvider>
              <RootNavigator />
            </PreviewProvider>
          </PrototypeProvider>
        </RankingsProvider>
      </AuthProvider>
      {splash && <Splash onDone={() => setSplash(false)} />}
    </SafeAreaProvider>
  );
}

export default App;
