import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import type { ConversationIndex } from '@/lib/conversationIndex'
import { isRtlLayout } from '@/lib/direction'
import type { MapSize, Rect } from '@/lib/mapLabels'
import type { MapCardDetail } from '@/types/map'
import type { MapControlsLayout } from '@/features/map/components/MapControlColumn'
import {
  layoutContactPins,
  type MapProjection,
} from '@/features/map/lib/mapPinLayout'
import type { ContactMarker } from '@/features/map/types/map'

const MAX_CARDS_PHONE = 12
const MAX_CARDS_WIDE = 24

const CLEARANCE = 8

export default function useContactPinItems({
  contacts,
  index,
  detail,
  projection,
  size,
  activeId,
  overlays,
}: {
  contacts: ContactMarker[]
  index: ConversationIndex
  detail: MapCardDetail
  projection: MapProjection | null

  size: MapSize
  activeId: string | undefined
  overlays: {
    top: number[]

    controls: MapControlsLayout | null

    inspectorLeft: number
    inspectorRight: number

    bottom: {
      base: number

      floatingCard: { bottom: number; height: number } | null

      cards: number | null
    }
  }
}) {
  const { isWide } = useAdaptiveLayout()
  const width = projection?.size.width ?? size.width
  const height = projection?.size.height ?? size.height
  const { bottom, controls } = overlays

  const bottomCover = bottom.floatingCard
    ? bottom.floatingCard.bottom + bottom.floatingCard.height
    : (bottom.cards ?? bottom.base)

  const avoid: Rect[] = []
  if (controls) {
    const start = controls.start - CLEARANCE
    const end = controls.start + controls.width + CLEARANCE
    avoid.push({
      left: isRtlLayout() ? width - end : start,
      right: isRtlLayout() ? width - start : end,
      top: controls.y - CLEARANCE,
      bottom: controls.y + controls.height + CLEARANCE,
    })
  }

  return layoutContactPins({
    contacts,
    index,
    nowMs: index.nowMs,
    detail,
    projection,
    activeId,
    maxCards: isWide ? MAX_CARDS_WIDE : MAX_CARDS_PHONE,
    cardBounds: {
      left: overlays.inspectorLeft,
      top: Math.max(...overlays.top) + 4,
      right: width - overlays.inspectorRight,
      bottom: height - bottomCover,
    },
    avoid,
  })
}
