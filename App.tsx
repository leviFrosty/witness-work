import 'react-native-gesture-handler'
import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import RootStackComponent from './src/stacks/RootStack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as Notifications from 'expo-notifications'
import * as Sentry from 'sentry-expo'
import './src/lib/locales'
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter'
import { LogBox, useColorScheme } from 'react-native'
import { StatusBar } from 'expo-status-bar' // automatically switches bar style based on theme!
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { TamaguiProvider } from 'tamagui'
import tamaguiConfig from './tamagui.config'
import ThemeProvider from './src/providers/ThemeProvider'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

/**
 * Non-urgent.
 * Warning comes from tamagui bug. Check back sometime in the future to see if still exists.
 * Repro: Go to home screen => click contact =>  + => close tamagui sheet => go back to home => WARN
 *  */
LogBox.ignoreLogs([
  'Sending `onAnimatedValueUpdate` with no listeners registered.',
])

Sentry.init({
  dsn: 'https://f9600209459a43d18c3d2c3a6ac2aa7b@o572512.ingest.sentry.io/4505271593074688',
  enableInExpoDevelopment: false,
  debug: __DEV__,
  attachScreenshot: true,
})

export default function App() {
  const colorScheme = useColorScheme()

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter: require('@tamagui/font-inter/otf/Inter-Medium.otf'),
    InterBold: require('@tamagui/font-inter/otf/Inter-Bold.otf'),
  })

  if (!fontsLoaded) {
    return null
  }

  try {
    return (
      <ThemeProvider>
        <TamaguiProvider
          defaultTheme={colorScheme || undefined}
          config={tamaguiConfig}
        >
          <NavigationContainer>
            <SafeAreaProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <StatusBar />
                <RootStackComponent />
              </GestureHandlerRootView>
            </SafeAreaProvider>
          </NavigationContainer>
        </TamaguiProvider>
      </ThemeProvider>
    )
  } catch (error) {
    Sentry.Native.captureException(error)
  }
}
