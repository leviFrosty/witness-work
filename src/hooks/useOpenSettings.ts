import { useNavigation } from '@react-navigation/native'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import type { HomeTabStackNavigation } from '@/types/homeStack'
import type { RootStackNavigation } from '@/types/rootStack'

type SettingsNavigation = RootStackNavigation & HomeTabStackNavigation

export default function useOpenSettings(navigation?: SettingsNavigation) {
  const contextNavigation = useNavigation<SettingsNavigation>()
  const { hasSidebar } = useAdaptiveLayout()
  const target = navigation ?? contextNavigation
  return () =>
    hasSidebar ? target.navigate('Settings') : target.navigate('SettingsMenu')
}
