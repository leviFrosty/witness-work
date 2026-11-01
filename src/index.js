import 'react-native-gesture-handler'
import '@tamagui/native/setup-gesture-handler'
import { registerRootComponent } from 'expo'
import './app/launch/recordLaunchLinks'

import App from './app/App'

registerRootComponent(App)
