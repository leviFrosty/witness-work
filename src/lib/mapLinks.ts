import links from '@/constants/links'
import { addressToString } from '@/lib/address'
import type { Contact, Coordinate } from '@/types/contact'

export const formatCoordinate = ({ latitude, longitude }: Coordinate) =>
  `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`

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

export const mapLinks = (query: string) => {
  const encoded = encodeURIComponent(query)
  return {
    apple: `${links.appleMapsBase}${encoded}`,
    google: `${links.googleMapsBase}${encoded}`,
  }
}

export const contactMapLinks = (contact: Contact) => {
  const query = contactMapQuery(contact)
  return query ? mapLinks(query) : null
}
