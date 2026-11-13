import '../../../env'
import '@/lib/locales'
import 'react-native-gesture-handler'
import { useEffect, useState } from 'react'
import { useColorScheme, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { TamaguiProvider } from 'tamagui'
import tamaguiConfig from '../../../tamagui.config'
import ToastHost from '@/components/toast/ToastHost'
import ThemeProvider from '@/providers/ThemeProvider'
import LaunchSplash from '@/app/launch/LaunchSplash'
import { useGuestFonts } from '@/app/territory-guest/useGuestFonts'
import { setAnalyticsEventsAllowed } from '@/lib/analyticsPolicy'
import { translationsLoaded } from '@/lib/locales'
import { logger } from '@/lib/logger'
import { GUEST_LINK_PATH } from '@/lib/sharedSpaces/scopes'
import { keepGuestPage, loadedFiles } from '@/lib/webOffline/guestWorker'
import { workerScriptURL } from '@/vendor/web/trustedTypes'
import TerritoryGuestPage from '@/features/territories/guest/TerritoryGuestPage'

setAnalyticsEventsAllowed(true)

export default function TerritoryGuestRoot() {
  const scheme = useColorScheme()
  const fontsLoaded = useGuestFonts()
  const [translated, setTranslated] = useState(false)

  useEffect(() => {
    void translationsLoaded()
      .catch(() => undefined)
      .then(() => setTranslated(true))
  }, [])

  const shown = fontsLoaded && translated
  useEffect(() => {
    if (!shown || __DEV__ || !('serviceWorker' in navigator)) return
    let keep = () => {}
    const left = () => {
      if (document.visibilityState === 'hidden') keep()
    }
    keepGuestPage(
      navigator.serviceWorker,
      workerScriptURL(),
      GUEST_LINK_PATH,
      () =>
        loadedFiles(performance.getEntriesByType('resource'), location.origin)
    )
      .then((kept) => {
        keep = kept.keep
      })
      .catch((error) => logger.warn('[guest] no service worker', error))
    document.addEventListener('visibilitychange', left)
    return () => document.removeEventListener('visibilitychange', left)
  }, [shown])

  if (!shown) return <LaunchSplash />
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider enabled={false} preload={false} preserveEdgeToEdge>
            <TamaguiProvider
              defaultTheme={scheme ?? undefined}
              config={tamaguiConfig}
            >
              <View style={{ flex: 1 }}>
                <TerritoryGuestPage />
              </View>
              <ToastHost />
            </TamaguiProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ThemeProvider>
  )
}
