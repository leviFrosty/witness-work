import '../env'
import './lib/locales'
import 'react-native-gesture-handler'
import React, { useEffect, useState } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import RootStackComponent from './stacks/RootStack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as Notifications from 'expo-notifications'
import * as Sentry from '@sentry/react-native'
import * as Updates from 'expo-updates'
import Constants from 'expo-constants'
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter'
import {
  ActivityIndicator,
  InteractionManager,
  LogBox,
  useColorScheme,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { TamaguiProvider } from 'tamagui'
import tamaguiConfig from '../tamagui.config'
import ThemeProvider from './providers/ThemeProvider'
import CustomerProvider from './providers/CustomerProvider'
import { ToastProvider, ToastViewport } from '@tamagui/toast'
import {
  hasMigratedFromAsyncStorage,
  migrateFromAsyncStorage,
} from './stores/mmkv'
import { usePreferences } from './stores/preferences'
import AnimationViewProvider from './providers/AnimationViewProvider'
import useUserLocalePrefs from './hooks/useLocale'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

/**
 * Non-urgent. Warning comes from tamagui bug.
 *
 * Check back sometime in the future to see if still exists.
 *
 * Repro: Go to home screen => click contact => + => close tamagui sheet => go
 * back to home => WARN
 */
LogBox.ignoreLogs([
  'Sending `onAnimatedValueUpdate` with no listeners registered.',
])

Sentry.init({
  dsn: 'https://f9600209459a43d18c3d2c3a6ac2aa7b@o572512.ingest.sentry.io/4505271593074688',
  enabled: !__DEV__,
  debug: __DEV__,
  attachScreenshot: true,
})

Sentry.setTag('deviceId', Constants.sessionId)
Sentry.setTag('appOwnership', Constants.appOwnership || 'N/A')
if (Constants.appOwnership === 'expo' && Constants.expoVersion) {
  Sentry.setTag('expoAppVersion', Constants.expoVersion)
}
Sentry.setTag('expoChannel', Updates.channel)
Sentry.setTag('expoUpdateVersion', Updates.updateId)

export default function App() {
  const systemColorScheme = useColorScheme()
  const { colorScheme } = usePreferences()
  useUserLocalePrefs()

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter: require('@tamagui/font-inter/otf/Inter-Medium.otf'),
    InterBold: require('@tamagui/font-inter/otf/Inter-Bold.otf'),
  })
  const [hasMigrated, setHasMigrated] = useState(hasMigratedFromAsyncStorage())

  useEffect(() => {
    if (!hasMigratedFromAsyncStorage()) {
      InteractionManager.runAfterInteractions(async () => {
        try {
          await migrateFromAsyncStorage()
          await Updates.reloadAsync() // Reloads JS and causes stores to point to new MMKV store
        } catch (e) {
          // Falls back to async storage
        }
        setHasMigrated(true) // Allows app to continue regardless
      })
    }
  }, [])

  if (!hasMigrated) {
    return (
      <View style={{ justifyContent: 'center', alignItems: 'center', flex: 1 }}>
        {/* show loading indicator while app is migrating storage... */}
        <ActivityIndicator />
      </View>
    )
  }

  if (!fontsLoaded) {
    return null
  }

  try {
    return (
      <ThemeProvider>
        <SafeAreaProvider>
          <CustomerProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <NavigationContainer>
                <TamaguiProvider
                  defaultTheme={
                    colorScheme ? colorScheme : systemColorScheme || undefined
                  }
                  config={tamaguiConfig}
                >
                  <ToastProvider>
                    <StatusBar />
                    <ToastViewport />
                    <AnimationViewProvider>
                      <RootStackComponent />
                    </AnimationViewProvider>
                  </ToastProvider>
                </TamaguiProvider>
              </NavigationContainer>
            </GestureHandlerRootView>
          </CustomerProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    )
  } catch (error) {
    Sentry.captureException(error)
  }
}
