import '../../../env'
import '@/lib/locales'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import ThemeProvider from '@/providers/ThemeProvider'
import LaunchSplash from '@/app/launch/LaunchSplash'
import OpenInAnotherTabScreen from '@/app/launch/OpenInAnotherTabScreen'
import { useAppFonts } from '@/app/useAppFonts'
import { webLinks } from '@/lib/webLinks/webLinks'
import { webStorageBoot } from '@/lib/webStorage/boot'

const takeOverHere = () =>
  void webLinks.keepForReload().then(webStorageBoot.takeOverHere)

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
