import { useWindowDimensions } from 'react-native'
import { getAdaptiveLayout } from '@/lib/sidebarLayout'
import { useSidebarPreferences, useSidebarResize } from '@/stores/sidebar'
import { useDisplayRegions } from '@/stores/displayRegions'

export default function useAdaptiveLayout({ liveResize = false } = {}) {
  const { width, fontScale } = useWindowDimensions()
  const savedWidth = useSidebarPreferences((s) => s.width)
  const hidden = useSidebarPreferences((s) => s.hidden)
  const dragCompact = useSidebarResize((s) => (liveResize ? s.compact : null))
  const verticalBarEdge = useDisplayRegions(
    (s) => s.regions?.verticalBarEdge ?? null
  )
  const layout = getAdaptiveLayout(width, fontScale, savedWidth, hidden, {
    verticalBarEdge,
  })

  return dragCompact === null
    ? layout
    : { ...layout, sidebarCompact: layout.sidebarVisible && dragCompact }
}
