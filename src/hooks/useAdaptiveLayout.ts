import { Platform, useWindowDimensions } from 'react-native'
import { getAdaptiveLayout } from '@/lib/sidebarLayout'
import { useTabBarInsetsStore } from '@/stores/tabBarInsets'

/**
 * Window-based so multitasking and Dynamic Type can use compact layouts.
 * Content gets what's left beside the native sidebar, as a tab measures it.
 */
export default function useAdaptiveLayout() {
  const { width, fontScale } = useWindowDimensions()
  const tabWidth = useTabBarInsetsStore((s) => s.insets?.width)
  return getAdaptiveLayout(width, fontScale, Platform.OS === 'ios', tabWidth)
}
