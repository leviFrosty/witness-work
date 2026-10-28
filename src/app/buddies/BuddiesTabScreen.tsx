import { useEffect, useRef } from 'react'
import { Dimensions } from 'react-native'
import { StackActions, useIsFocused } from '@react-navigation/native'
import { getAdaptiveLayout } from '@/lib/sidebarLayout'
import BuddiesRouteScreen from '@/app/buddies/BuddiesRouteScreen'
import { navigationRef } from '@/features/contacts/lib/linking'

/**
 * Buddies as the iPad sidebar's tab. The tab exists only beside the sidebar:
 * when the window gets too narrow for one (Split View, Stage Manager), it goes
 * away and the app would land on Home, so Buddies reopens as a page.
 */
export default function BuddiesTabScreen() {
  const isFocused = useIsFocused()
  const focused = useRef(isFocused)

  useEffect(() => {
    focused.current = isFocused
  }, [isFocused])

  useEffect(
    () => () => {
      const { width, fontScale } = Dimensions.get('window')
      const { hasSidebar } = getAdaptiveLayout(width, fontScale, 0, false)
      if (!focused.current || hasSidebar) return
      requestAnimationFrame(() => {
        if (navigationRef.isReady())
          navigationRef.dispatch(StackActions.push('Buddies'))
      })
    },
    []
  )

  return <BuddiesRouteScreen asTab />
}
