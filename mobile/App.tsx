/**
 * AUX mobile app
 *
 * @format
 */

import 'react-native-gesture-handler';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PrototypeProvider } from './src/state/PrototypeProvider';
import { RootNavigator } from './src/navigation/RootNavigator';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <PrototypeProvider>
        <RootNavigator />
      </PrototypeProvider>
    </SafeAreaProvider>
  );
}

export default App;
