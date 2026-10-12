import { useEffect } from 'react'
import {
  type NavigationHelpers,
  type ParamListBase,
  type TabNavigationState,
  useIsFocused,
} from '@react-navigation/native'
import type { NativeBottomTabNavigationEventMap } from '@react-navigation/bottom-tabs/unstable'

import { errorTracking } from '@/lib/errorTracking'
import * as SystemMenu from '../../../modules/system-menu'

type Props = {
  state: TabNavigationState<ParamListBase>
  navigation: NavigationHelpers<
    ParamListBase,
    NativeBottomTabNavigationEventMap
  >
  /** Tabs that act rather than open a destination, e.g. Quick Action. */
  actions: readonly string[]
}

/**
 * Command-1, Command-2, … open the destinations in order on a hardware
 * keyboard, while no other root screen covers the tabs.
 */
export default function TabShortcuts({ state, navigation, actions }: Props) {
  const isFocused = useIsFocused()
  const destinationCount = state.routes.filter(
    (route) => !actions.includes(route.name)
  ).length

  useEffect(() => {
    if (!SystemMenu.supportsNavigationShortcuts) return
    const shortcutSubscription = SystemMenu.subscribeToNavigationShortcut(
      ({ input }) => {
        if (!isFocused) return
        const route = state.routes
          .filter((candidate) => !actions.includes(candidate.name))
          .find((_, index) => input === String(index + 1))
        if (!route) return
        const selected = state.routes[state.index]
        const pressTab = () => {
          // Lets the open tab react to being picked again, e.g. the map refits.
          navigation.emit({ type: 'tabPress', target: route.key })
          if (selected.key !== route.key) {
            navigation.navigate(route.name, route.params)
          }
        }
        // Only a call inside try/catch, so React Compiler can compile this.
        try {
          pressTab()
        } catch (error) {
          errorTracking.captureException(error)
        }
      }
    )
    return () => shortcutSubscription?.remove()
  }, [actions, isFocused, navigation, state])

  useEffect(() => {
    if (!SystemMenu.supportsNavigationShortcuts) return
    void SystemMenu.configureNavigationShortcuts(
      isFocused
        ? Array.from({ length: destinationCount }, (_, index) =>
            String(index + 1)
          )
        : []
    ).catch((error: unknown) => {
      errorTracking.captureException(error)
    })
    return () => {
      void SystemMenu.configureNavigationShortcuts([]).catch((error: unknown) =>
        errorTracking.captureException(error)
      )
    }
  }, [destinationCount, isFocused])

  return null
}
