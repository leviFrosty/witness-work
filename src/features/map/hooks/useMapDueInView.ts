import type { ConversationIndex } from '@/lib/conversationIndex'
import { isDue } from '@/features/map/lib/contactPins'
import type { MapProjection } from '@/features/map/lib/mapPinLayout'
import type { ContactMarker } from '@/features/map/types/map'

/** The Contacts in the map's view due now or this week, for Select Due. */
export default function useMapDueInView({
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

  return contacts.filter(
    (contact) => isDue(contact.id, index, index.nowMs) && inView(contact)
  )
}
