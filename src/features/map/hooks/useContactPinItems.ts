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

/** Most cards shown at once, so the map stays readable. */
const MAX_CARDS_PHONE = 12
const MAX_CARDS_WIDE = 24

/** Room cards leave around the controls over the map. */
const CLEARANCE = 8

/**
 * The Map's pins and cards for the camera now, with the cards kept out from
 * under what floats over the map: the search and chips along the top, the
 * control column, the inspector, and the cards or bars along the bottom.
 */
export default function useContactPinItems({
  contacts,
  index,
  detail,
  projection,
  size,
  activeId,
  picked,
  dueLens,
  overlays,
}: {
  contacts: ContactMarker[]
  index: ConversationIndex
  detail: MapCardDetail
  projection: MapProjection | null
  /** The map's size, until the projection has it. */
  size: MapSize
  activeId: string | undefined
  /** Select mode's picks on the map; null outside Select mode. */
  picked: ReadonlySet<string> | null
  dueLens: boolean
  overlays: {
    /** Where what floats along the top ends: the search, the chips. */
    top: number[]
    /** The control column, once it's laid out. */
    controls: MapControlsLayout | null
    /** Room the inspector takes on each side, in physical points. */
    inspectorLeft: number
    inspectorRight: number
    /** What floats over the bottom edge, measured from it. */
    bottom: {
      /** The bars and the map's legal strip. */
      base: number
      /** Select mode's bar or a group's list, while one shows. */
      floatingCard: { bottom: number; height: number } | null
      /** The phone's cards, or their handle once stowed, while they show. */
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

  // The control column sits on the leading edge, the physical right in a
  // right-to-left layout, like the inspector on the other side. Map points
  // are physical.
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
    checkedIds: picked,
    dueLens,
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
