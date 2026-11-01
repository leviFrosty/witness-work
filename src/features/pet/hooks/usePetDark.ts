import { useColorScheme } from 'react-native'
import { usePreferences } from '@/stores/preferences'

export default function usePetDark(): boolean {
  const system = useColorScheme()
  const chosen = usePreferences((state) => state.colorScheme)
  const scheme = system ?? undefined
  return (chosen ?? scheme) !== 'light'
}
