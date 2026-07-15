import 'react-native-gesture-handler'
import '@tamagui/native/setup-burnt'
import '@tamagui/native/setup-gesture-handler'
import { registerRootComponent } from 'expo'

import App from './app/App'

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App)
