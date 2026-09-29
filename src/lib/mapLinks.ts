import links from '@/constants/links'
import { addressToString } from '@/lib/address'
import type { Contact, Coordinate } from '@/types/contact'

/** "lat, lng" at the precision the dropped-pin card shows. */
export const formatCoordinate = ({ latitude, longitude }: Coordinate) =>
  `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`

/**
 * What a shared map link should search for: the address, or the pin when the
 * user dragged it (the address no longer describes it) or there is no address.
 */
export const contactMapQuery = (contact: Contact) => {
  const address = addressToString(contact.address)
  const coordinate =
    contact.coordinate?.latitude !== undefined &&
    contact.coordinate?.longitude !== undefined
      ? `${contact.coordinate.latitude}, ${contact.coordinate.longitude}`
      : ''
  if (contact.userDraggedCoordinate && coordinate) return coordinate
  return address || coordinate
}

/** Shareable Apple Maps and Google Maps links for a search query. */
export const mapLinks = (query: string) => {
  const encoded = encodeURIComponent(query)
  return {
    apple: `${links.appleMapsBase}${encoded}`,
    google: `${links.googleMapsBase}${encoded}`,
  }
}

/** Shareable map links for a Contact, if it has a place. */
export const contactMapLinks = (contact: Contact) => {
  const query = contactMapQuery(contact)
  return query ? mapLinks(query) : null
}
