import { useEffect, useEffectEvent } from 'react'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import {
  type NavigationProp,
  type ParamListBase,
  useNavigation,
  useRoute,
} from '@react-navigation/native'

export default function useTabReselect(onReselect: () => void) {
  const navigation = useNavigation<NavigationProp<ParamListBase>>()
  const route = useRoute()
  const reselect = useEffectEvent(onReselect)

  useEffect(() => {
    let tab: NavigationProp<ParamListBase> | undefined = navigation
    while (tab && tab.getState()?.type !== 'tab') tab = tab.getParent()
    if (!tab) return
    const isTab = tab === navigation
    return (tab as BottomTabNavigationProp<ParamListBase>).addListener(
      'tabPress',
      (e) => {
        if (!navigation.isFocused()) return
        if (!isTab && navigation.getState().routes[0]?.key !== route.key) return

        requestAnimationFrame(() => {
          if (!e.defaultPrevented) reselect()
        })
      }
    )
  }, [navigation, route.key])
}
