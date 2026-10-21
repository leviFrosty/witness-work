import { Platform, useColorScheme } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { NavigationBar } from 'expo-navigation-bar'
import { usePreferences } from '@/stores/preferences'
import { systemBarStyle } from '@/app/components/systemBarStyle'

/**
 * The status bar and Android's navigation bar follow the app's appearance
 * rather than the system's. A Light or Dark choice in Personalization that
 * differs from the system would otherwise leave dark icons on a dark screen (or
 * light on light). Android also sets its navigation bar only when the app
 * starts, so it kept the old colors when the system switched while open.
 */
export default function SystemBars() {
  const system = useColorScheme()
  const chosen = usePreferences((s) => s.colorScheme)
  const style = systemBarStyle(chosen, system)

  return (
    <>
      <StatusBar style={style} />
      {Platform.OS === 'android' && <NavigationBar style={style} />}
    </>
  )
}
