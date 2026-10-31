import type { PropsWithChildren } from 'react'
import { useColorScheme } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { TamaguiProvider } from 'tamagui'
import tamaguiConfig from '../../../tamagui.config'
import ToastHost from '@/components/toast/ToastHost'
import { PointerTooltipLayer } from '@/components/ui/PointerTooltip'
import { PopoverTouchShield } from '@/components/ui/popoverTouchShield'
import ThemeProvider from '@/providers/ThemeProvider'
import { usePreferences } from '@/stores/preferences'
import LaunchSplash from '@/app/launch/LaunchSplash'
import { useAppFonts } from '@/app/useAppFonts'

/**
 * Web: what the sign-in pages render in place of the app, with the providers
 * they use and none of the app's runtimes.
 */
export default function WebSignInRoot({ children }: PropsWithChildren) {
  const fontsLoaded = useAppFonts()
  const systemColorScheme = useColorScheme()
  const colorScheme = usePreferences((s) => s.colorScheme)
  if (!fontsLoaded) return <LaunchSplash />
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <PopoverTouchShield>
            <TamaguiProvider
              defaultTheme={
                colorScheme ? colorScheme : systemColorScheme || undefined
              }
              config={tamaguiConfig}
            >
              {children}
              <ToastHost />
              <PointerTooltipLayer />
            </TamaguiProvider>
          </PopoverTouchShield>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ThemeProvider>
  )
}
