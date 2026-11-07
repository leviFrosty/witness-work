import { useColorScheme } from 'react-native'
import { usePreferences } from '@/stores/preferences'

export default function useResolvedScheme(): 'light' | 'dark' {
  const chosen = usePreferences((s) => s.colorScheme)
  const system = useColorScheme()
  return (chosen ?? system) === 'dark' ? 'dark' : 'light'
}
