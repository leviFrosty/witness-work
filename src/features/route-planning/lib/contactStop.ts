import { addressToString } from '@/lib/address'
import type { Contact, Coordinate } from '@/types/contact'
import { coordinateText } from '@/features/route-planning/lib/coordinateText'
import type { AddedStop } from '@/features/route-planning/lib/routeBuilder'

/**
 * A Contact as a stop added by hand. Navigation apps get the address, or the
 * pin when the User moved it or there's no address.
 */
export const contactStop = (
  contact: Contact & { coordinate: Coordinate }
): AddedStop => {
  const address = addressToString(contact.address).trim()
  return {
    key: `contact:${contact.id}`,
    kind: 'contact',
    title: contact.name,
    subtitle: address || undefined,
    coordinate: contact.coordinate,
    destination:
      contact.userDraggedCoordinate || !address
        ? coordinateText(contact.coordinate)
        : address,
  }
}
