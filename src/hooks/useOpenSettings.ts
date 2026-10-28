import { useNavigation } from '@react-navigation/native'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import type { HomeTabStackNavigation } from '@/types/homeStack'
import type { RootStackNavigation } from '@/types/rootStack'

type SettingsNavigation = RootStackNavigation & HomeTabStackNavigation

/**
 * Opens Settings where the layout keeps it: the sidebar's Settings page beside
 * the open one when wide, the pushed Settings menu otherwise. Outside a screen
 * (the tab bar), pass the tab navigator's `navigation`.
 */
export default function useOpenSettings(navigation?: SettingsNavigation) {
  const contextNavigation = useNavigation<SettingsNavigation>()
  const { hasSidebar } = useAdaptiveLayout()
  const target = navigation ?? contextNavigation
  return () =>
    hasSidebar ? target.navigate('Settings') : target.navigate('SettingsMenu')
}
