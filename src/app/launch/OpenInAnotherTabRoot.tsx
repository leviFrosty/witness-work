import '../../../env'
import '@/lib/locales'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import ThemeProvider from '@/providers/ThemeProvider'
import LaunchSplash from '@/app/launch/LaunchSplash'
import OpenInAnotherTabScreen from '@/app/launch/OpenInAnotherTabScreen'
import { useAppFonts } from '@/app/useAppFonts'
import { webLinks } from '@/lib/webLinks/webLinks'
import { webStorageBoot } from '@/lib/webStorage/boot'

/**
 * Use Here reloads the tab: a contact or Buddies link it opened with is sealed
 * for that reload first, however long the tab waited (`webLinks.ts`).
 */
const takeOverHere = () =>
  void webLinks.keepForReload().then(webStorageBoot.takeOverHere)

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
        <OpenInAnotherTabScreen onUseHere={takeOverHere} />
      </SafeAreaProvider>
    </ThemeProvider>
  )
}
