import { addressToString } from '@/lib/address'
import type { Contact, Coordinate } from '@/types/contact'
import { coordinateText } from '@/features/route-planning/lib/coordinateText'
import type { AddedStop } from '@/features/route-planning/lib/routeBuilder'

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
