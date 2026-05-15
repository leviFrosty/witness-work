import { useColorScheme } from 'react-native'
import { GlassColorScheme } from 'expo-glass-effect'
import { usePreferences } from '@/stores/preferences'

/**
 * Resolves the `colorScheme` prop for `expo-glass-effect`'s `GlassView` from
 * the user's in-app theme preference, falling back to the system appearance.
 *
 * Without this, `GlassView` always reads the system trait collection — so the
 * glass material keeps its system-light/dark look even after the user flips the
 * in-app theme toggle, until the app is hard-reloaded.
 */
const useGlassColorScheme = (): GlassColorScheme => {
  const system = useColorScheme()
  const { colorScheme: preference } = usePreferences()

  if (preference === 'light' || preference === 'dark') {
    return preference
  }
  if (system === 'light' || system === 'dark') {
    return system
  }
  return 'auto'
}

export default useGlassColorScheme
