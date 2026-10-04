import { useWindowDimensions } from 'react-native'
import { getAdaptiveLayout } from '@/lib/sidebarLayout'
import { useSidebarPreferences, useSidebarResize } from '@/stores/sidebar'

/**
 * Window-based so multitasking and Dynamic Type can use compact layouts. Only
 * navigation previews the live label mode; the drag width itself animates on
 * the UI thread. Content breakpoints settle on release so dragging does not
 * repeatedly rebuild navigators and sheet portals.
 */
export default function useAdaptiveLayout({ liveResize = false } = {}) {
  const { width, fontScale } = useWindowDimensions()
  const savedWidth = useSidebarPreferences((s) => s.width)
  const hidden = useSidebarPreferences((s) => s.hidden)
  const dragCompact = useSidebarResize((s) => (liveResize ? s.compact : null))
  const layout = getAdaptiveLayout(width, fontScale, savedWidth, hidden)

  return dragCompact === null
    ? layout
    : { ...layout, sidebarCompact: layout.sidebarVisible && dragCompact }
}
