import { useColorScheme } from 'react-native'
import { usePreferences } from '@/stores/preferences'

/** Light or dark, as the app's theme resolves it, for the pet's own colours. */
export default function usePetDark(): boolean {
  const system = useColorScheme()
  const chosen = usePreferences((state) => state.colorScheme)
  const scheme = system ?? undefined
  return (chosen ?? scheme) !== 'light'
}
