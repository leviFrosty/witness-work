import { useEffect, useState } from 'react'
import { useIsFocused } from '@react-navigation/native'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import TabBar from '@/components/ui/TabBar'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'

import { errorTracking } from '@/lib/errorTracking'
import * as SystemMenu from '../../../modules/system-menu'

/** Number only the destinations that this navigator actually exposes. */
export default function NavigationTabBar(props: BottomTabBarProps) {
  const [commandPressed, setCommandPressed] = useState(false)
  const isFocused = useIsFocused()
  const { hasSidebar, sidebarVisible } = useAdaptiveLayout()
  const navigationVisible = !hasSidebar || sidebarVisible
  const shortcuts = props.state.routes.map((route, index) => ({
    route,
    input: String(index + 1),
  }))

  useEffect(() => {
    if (!SystemMenu.supportsNavigationShortcuts) return
    const keySubscription = SystemMenu.subscribeToCommandKey(({ pressed }) => {
      setCommandPressed(pressed)
    })
    return () => keySubscription?.remove()
  }, [])

  useEffect(() => {
    if (!SystemMenu.supportsNavigationShortcuts) return
    const shortcutSubscription = SystemMenu.subscribeToNavigationShortcut(
      ({ input }) => {
        if (!isFocused) return
        const route = props.state.routes.find(
          (_, index) => input === String(index + 1)
        )
        if (!route) return
        const selected = props.state.routes[props.state.index]
        try {
          const event = props.navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          })

          if (selected.key !== route.key && !event.defaultPrevented) {
            props.navigation.navigate(route.name, route.params)
          }
        } catch (error) {
          errorTracking.captureException(error)
        }
      }
    )
    return () => shortcutSubscription?.remove()
  }, [isFocused, props.navigation, props.state])

  useEffect(() => {
    if (!SystemMenu.supportsNavigationShortcuts) return
    void SystemMenu.configureNavigationShortcuts(
      isFocused ? props.state.routes.map((_, index) => String(index + 1)) : []
    ).catch((error: unknown) => {
      errorTracking.captureException(error)
    })
    return () => {
      void SystemMenu.configureNavigationShortcuts([]).catch((error: unknown) =>
        errorTracking.captureException(error)
      )
    }
  }, [isFocused, props.state.routes])

  return (
    <TabBar
      {...props}
      shortcutHints={
        isFocused && navigationVisible && commandPressed
          ? Object.fromEntries(
              shortcuts.map(({ route, input }) => [route.key, input])
            )
          : undefined
      }
    />
  )
}
