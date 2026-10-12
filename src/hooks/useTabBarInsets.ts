import { useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { type TabBarInsets, useTabBarInsetsStore } from '@/stores/tabBarInsets'

/**
 * The room the native tab bar leaves: pad a tab's scrolling content by
 * `bottom`, put its header below `top`, and keep window-wide overlays
 * `windowBottom` up from the window's edge. Falls back to the window's safe
 * area until a tab has been measured.
 */
export default function useTabBarInsets(): TabBarInsets {
  const measured = useTabBarInsetsStore((s) => s.insets)
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  return (
    measured ?? {
      top: insets.top,
      bottom: insets.bottom,
      windowBottom: insets.bottom,
      width,
    }
  )
}
