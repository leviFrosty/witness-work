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
import { useAppFonts } from '@/app/useAppFonts'
import { setAnalyticsEventsAllowed } from '@/lib/analyticsPolicy'
import { translationsLoaded } from '@/lib/locales'
import TerritoryGuestPage from '@/features/territories/guest/TerritoryGuestPage'

setAnalyticsEventsAllowed(true)

export default function TerritoryGuestRoot() {
  const scheme = useColorScheme()
  const fontsLoaded = useAppFonts()
  const [translated, setTranslated] = useState(false)

  useEffect(() => {
    void translationsLoaded()
      .catch(() => undefined)
      .then(() => setTranslated(true))
  }, [])

  if (!fontsLoaded || !translated) return <LaunchSplash />
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
