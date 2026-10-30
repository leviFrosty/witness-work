import { useColorScheme } from 'react-native'
import { usePreferences } from '@/stores/preferences'

/**
 * The appearance the app is drawn in: the User's own choice, else the system's.
 * For `color-scheme` on form controls, which the browser draws.
 */
export default function useResolvedScheme(): 'light' | 'dark' {
  const chosen = usePreferences((s) => s.colorScheme)
  const system = useColorScheme()
  return (chosen ?? system) === 'dark' ? 'dark' : 'light'
}
