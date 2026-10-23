import { useState } from 'react'
import { analytics } from '@/lib/analytics'
import type { ConversationIndex } from '@/lib/conversationIndex'
import { followUpState } from '@/features/map/lib/contactPins'
import type { MapProjection } from '@/features/map/lib/mapPinLayout'
import type { ContactMarker } from '@/features/map/types/map'

/**
 * The Map's due lens: the Contacts in view due now or this week (the due chip's
 * counts, and Select mode's Select Due), and the toggle that keeps only them
 * bright, with their cards.
 */
export default function useMapDueLens({
  contacts,
  index,
  projection,
  top,
}: {
  contacts: ContactMarker[]
  index: ConversationIndex
  projection: MapProjection | null
  /** Where the map's open area starts, under the header. */
  top: number
}) {
  const [active, setActive] = useState(false)

  /** In the map's view right now; everyone before it settles. */
  const inView = (contact: ContactMarker) => {
    if (!projection) return true
    const { x, y } = projection.project(contact.coordinate!)
    return (
      x >= 0 &&
      y >= top &&
      x <= projection.size.width &&
      y <= projection.size.height
    )
  }

  const dueInView = contacts
    .map((contact) => ({
      contact,
      kind: followUpState(contact.id, index, index.nowMs)?.kind,
    }))
    .filter(
      ({ contact, kind }) => !!kind && kind !== 'later' && inView(contact)
    )

  const toggle = () => {
    if (!active) analytics.capture('map_due_lens_applied')
    setActive(!active)
  }

  return {
    active,
    /** Due now or this week, in view. */
    due: dueInView.map(({ contact }) => contact),
    overdueCount: dueInView.filter(({ kind }) => kind === 'overdue').length,
    toggle,
    clear: () => setActive(false),
  }
}
