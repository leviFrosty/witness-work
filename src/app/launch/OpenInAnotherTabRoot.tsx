import '../../../env'
import '@/lib/locales'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import ThemeProvider from '@/providers/ThemeProvider'
import LaunchSplash from '@/app/launch/LaunchSplash'
import OpenInAnotherTabScreen from '@/app/launch/OpenInAnotherTabScreen'
import { useAppFonts } from '@/app/useAppFonts'
import { webStorageBoot } from '@/lib/webStorage/boot'

/**
 * Web: the root a tab renders in place of the app while WitnessWork is open in
 * another tab. Its stores are loaded read-only, for the User's language and
 * theme; nothing else of the app starts.
 */
export default function OpenInAnotherTabRoot() {
  const fontsLoaded = useAppFonts()
  if (!fontsLoaded) return <LaunchSplash />
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <OpenInAnotherTabScreen onUseHere={webStorageBoot.takeOverHere} />
      </SafeAreaProvider>
    </ThemeProvider>
  )
}
