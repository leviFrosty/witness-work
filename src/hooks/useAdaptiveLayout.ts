import { useWindowDimensions } from 'react-native'
import { getAdaptiveLayout } from '@/lib/sidebarLayout'
import { useSidebarPreferences, useSidebarResize } from '@/stores/sidebar'

/**
 * Window-based so multitasking and Dynamic Type can use compact layouts. Only
 * navigation previews live drag widths. Content breakpoints settle on release
 * so dragging does not repeatedly rebuild navigators and sheet portals.
 */
export default function useAdaptiveLayout({ liveResize = false } = {}) {
  const { width, fontScale } = useWindowDimensions()
  const savedWidth = useSidebarPreferences((s) => s.width)
  const hidden = useSidebarPreferences((s) => s.hidden)
  const dragWidth = useSidebarResize((s) => (liveResize ? s.width : null))

  return getAdaptiveLayout(width, fontScale, dragWidth ?? savedWidth, hidden)
}
