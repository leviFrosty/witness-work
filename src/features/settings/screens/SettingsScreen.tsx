import { useEffect } from 'react'
import { useNavigation } from '@react-navigation/native'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import SettingsContents from '@/features/settings/components/SettingsContents'

/** Settings on compact layouts, pushed from the account menu. */
const SettingsScreen = () => {
  const navigation = useNavigation()
  const { hasSidebar } = useAdaptiveLayout()

  // Wide layouts show Settings in the sidebar instead.
  useEffect(() => {
    if (hasSidebar && navigation.canGoBack()) navigation.goBack()
  }, [hasSidebar, navigation])

  return <SettingsContents />
}

export default SettingsScreen
