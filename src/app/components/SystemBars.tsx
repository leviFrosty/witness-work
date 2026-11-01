import { Platform, useColorScheme } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { NavigationBar } from 'expo-navigation-bar'
import { usePreferences } from '@/stores/preferences'
import { systemBarStyle } from '@/app/components/systemBarStyle'

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
