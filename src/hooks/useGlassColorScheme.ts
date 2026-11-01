import { useContext } from 'react'
import { useColorScheme } from 'react-native'
import { GlassColorScheme } from 'expo-glass-effect'
import { GlassColorSchemeOverrideContext } from '@/contexts/glassColorScheme'
import { usePreferences } from '@/stores/preferences'

const useGlassColorScheme = (): GlassColorScheme => {
  const system = useColorScheme()
  const preference = usePreferences((s) => s.colorScheme)
  const override = useContext(GlassColorSchemeOverrideContext)

  if (override) return override
  if (preference === 'light' || preference === 'dark') {
    return preference
  }
  if (system === 'light' || system === 'dark') {
    return system
  }
  return 'auto'
}

export default useGlassColorScheme
