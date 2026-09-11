import { useWindowDimensions } from 'react-native'

/** Window-based so iPad multitasking and Dynamic Type can use compact layouts. */
export default function useAdaptiveLayout() {
  const { width, fontScale } = useWindowDimensions()
  const hasSidebar = width >= 1000 && fontScale <= 1.3
  const sidebarWidth = hasSidebar ? 200 : 0
  const contentWidth = width - sidebarWidth

  return {
    hasSidebar,
    sidebarWidth,
    contentWidth,
    isWide: contentWidth >= 760 && fontScale <= 1.3,
    contentMaxWidth: 1200,
  }
}
