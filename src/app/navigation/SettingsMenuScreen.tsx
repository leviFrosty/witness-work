import { useEffect } from 'react'
import {
  CommonActions,
  useNavigation,
  useRoute,
} from '@react-navigation/native'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import SettingsContents from '@/features/settings/components/SettingsContents'
import { settingsDetailScreens } from '@/app/navigation/settingsDetailScreens'
import { navigationRef } from '@/features/contacts/lib/linking'

const settingsPages = new Set<string>(
  settingsDetailScreens.map(({ name }) => name)
)

const SettingsMenuScreen = () => {
  const navigation = useNavigation()
  const route = useRoute()
  const { hasSidebar } = useAdaptiveLayout()

  useEffect(() => {
    if (!hasSidebar) return
    const state = navigation.getState()
    const index = state?.routes.findIndex(({ key }) => key === route.key) ?? -1
    if (!state || index < 1) return
    const pages = state.routes.slice(index + 1)

    if (pages.some(({ name }) => !settingsPages.has(name))) return
    const page = pages[pages.length - 1]
    navigation.dispatch(
      CommonActions.reset({
        ...state,
        index: index - 1,
        routes: state.routes.slice(0, index),
      })
    )
    const openTab = CommonActions.navigate('Root', {
      screen: 'Settings',
      params: page && { screen: page.name, params: page.params },
    })

    requestAnimationFrame(() => {
      if (navigationRef.isReady()) navigationRef.dispatch(openTab)
    })
  }, [hasSidebar, navigation, route.key])

  return <SettingsContents />
}

export default SettingsMenuScreen
