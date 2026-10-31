import 'react-native-gesture-handler'
import '@tamagui/native/setup-gesture-handler'
import { registerRootComponent } from 'expo'
import { beforeAppLoads } from './app/launch/beforeAppLoads'

beforeAppLoads(() => {
  // Loaded first, before the rest of the app, so a link tapped while it starts
  // isn't dropped.
  require('./app/launch/recordLaunchLinks')

  // registerRootComponent calls AppRegistry.registerComponent('main', () => App);
  // It also ensures that whether you load the app in Expo Go or in a native build,
  // the environment is set up appropriately
  registerRootComponent(require('./app/App').default)
})
