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
  Platform,
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
import { installWidgetSync } from './lib/widgets/widgetSync'
import { installiCloudSync, iCloudSync } from './lib/sync/iCloudSync'
import { linking, navigationRef } from './lib/linking'
import DeepLinkListeners from './components/DeepLinkListeners'
import useIsSupporter from './hooks/useIsSupporter'
import { useSupporter } from './stores/supporter'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
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

/**
 * Mirrors supporter status into the `useSupporter` zustand store so non-React
 * code (widget snapshot writer) can branch on it without pulling from
 * `CustomerContext`. Kept tiny and side-effect-only so it composes cleanly
 * alongside `SupporterSyncDefault`.
 */
function SupporterStoreSync() {
  const { isSupporter } = useIsSupporter()
  useEffect(() => {
    useSupporter.getState().setSupporter(isSupporter)
  }, [isSupporter])
  return null
}

/**
 * Auto-enables iCloud sync for supporters who haven't explicitly chosen a
 * setting yet. Runs inside CustomerProvider so useIsSupporter is available.
 * Once the user touches the toggle in Settings, `iCloudSyncSetByUser` is set
 * and this effect becomes a permanent no-op.
 *
 * Delegates to `resolveInitialEnable()` + `apply*Enable()` so auto-enable
 * shares the same look-before-leaping decision as the manual Settings toggle.
 * Critically, the `conflict` outcome (remote data exists AND local has
 * meaningful user records) leaves sync **disabled** — a headless auto-enable
 * can't safely pick between keep-local / use-remote / merge, and silently
 * defaulting to any of them can clobber data. Users land in Settings and
 * resolve explicitly via `FirstEnableSheet`.
 */
function SupporterSyncDefault() {
  const { isSupporter } = useIsSupporter()
  const { iCloudSyncEnabled, iCloudSyncSetByUser } = usePreferences()

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    if (!isSupporter) return
    if (iCloudSyncSetByUser) return
    if (iCloudSyncEnabled) return

    let cancelled = false
    void (async () => {
      const decision = await iCloudSync.resolveInitialEnable()
      if (cancelled) return
      switch (decision.outcome) {
        case 'seed':
          await iCloudSync.applySeedEnable()
          return
        case 'pull':
          iCloudSync.applyPullEnable(decision.remote)
          return
        case 'conflict':
        case 'unavailable':
          return
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isSupporter, iCloudSyncSetByUser, iCloudSyncEnabled])

  return null
}

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
        } catch {
          // Falls back to async storage
        }
        setHasMigrated(true) // Allows app to continue regardless
      })
    }
  }, [])

  // Install iOS widget snapshot sync after MMKV is the source of truth.
  // No-op before the native module is linked (pre-prebuild).
  useEffect(() => {
    if (!hasMigrated) return
    const teardown = installWidgetSync()
    return teardown
  }, [hasMigrated])

  // Install the iCloud sync layer after storage is settled. Gated internally
  // on iOS + supporter opt-in (preferences.iCloudSyncEnabled), so this is a
  // no-op for users who haven't turned it on or don't have the native module
  // linked.
  useEffect(() => {
    if (!hasMigrated) return
    const teardown = installiCloudSync()
    return teardown
  }, [hasMigrated])

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
      <CustomerProvider>
        <SupporterStoreSync />
        <SupporterSyncDefault />
        <ThemeProvider>
          <SafeAreaProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <NavigationContainer ref={navigationRef} linking={linking}>
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
                      <DeepLinkListeners />
                      <RootStackComponent />
                    </AnimationViewProvider>
                  </ToastProvider>
                </TamaguiProvider>
              </NavigationContainer>
            </GestureHandlerRootView>
          </SafeAreaProvider>
        </ThemeProvider>
      </CustomerProvider>
    )
  } catch (error) {
    Sentry.captureException(error)
  }
}
