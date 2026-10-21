import { useEffect, useEffectEvent } from 'react'
import {
  type EventArg,
  type NavigationProp,
  type ParamListBase,
  useNavigation,
  useRoute,
} from '@react-navigation/native'

/**
 * Calls `onReselect` when the user taps the tab (or sidebar row, or its
 * keyboard shortcut) of the screen they're already on, e.g. to scroll back to
 * the top. The first tap only switches tabs. A screen in a stack inside the tab
 * only hears it while it's the stack's first screen.
 */
export default function useTabReselect(onReselect: () => void) {
  const navigation = useNavigation<NavigationProp<ParamListBase>>()
  const route = useRoute()
  const reselect = useEffectEvent(onReselect)

  useEffect(() => {
    let tab: NavigationProp<ParamListBase> | undefined = navigation
    while (tab && tab.getState()?.type !== 'tab') tab = tab.getParent()
    if (!tab) return
    const isTab = tab === navigation
    return tab.addListener(
      // @ts-expect-error `tabPress` is only on tab navigators' event maps.
      'tabPress',
      (e: EventArg<'tabPress', true>) => {
        // Checked before the press switches tabs, so a first tap doesn't count.
        if (!navigation.isFocused()) return
        if (!isTab && navigation.getState().routes[0]?.key !== route.key) return
        // A frame later, once every listener has had the chance to prevent it.
        requestAnimationFrame(() => {
          if (!e.defaultPrevented) reselect()
        })
      }
    )
  }, [navigation, route.key])
}
