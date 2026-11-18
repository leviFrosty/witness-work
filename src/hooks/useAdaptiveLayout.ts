import { useWindowDimensions } from 'react-native'
import { getAdaptiveLayout } from '@/lib/sidebarLayout'
import {
  useSidebarGutter,
  useSidebarPreferences,
  useSidebarResize,
} from '@/stores/sidebar'
import { useDisplayRegions } from '@/stores/displayRegions'

export default function useAdaptiveLayout({ liveResize = false } = {}) {
  const { width, fontScale } = useWindowDimensions()
  const savedWidth = useSidebarPreferences((s) => s.width)
  const hidden = useSidebarPreferences((s) => s.hidden)
  const dragCompact = useSidebarResize((s) => (liveResize ? s.compact : null))
  const verticalBarEdge = useDisplayRegions(
    (s) => s.regions?.verticalBarEdge ?? null
  )
  const gutterWindowControls = useSidebarGutter((s) => s.windowControls)
  const layout = getAdaptiveLayout(width, fontScale, savedWidth, hidden, {
    verticalBarEdge,
    gutterWindowControls,
  })

  return dragCompact === null
    ? layout
    : { ...layout, sidebarCompact: layout.sidebarVisible && dragCompact }
}
