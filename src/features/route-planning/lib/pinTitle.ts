import * as Location from 'expo-location'
import type { Coordinate } from '@/types/contact'

export async function pinTitle(
  coordinate: Coordinate
): Promise<string | undefined> {
  try {
    const [place] = await Location.reverseGeocodeAsync(coordinate)
    if (!place) return undefined
    const street = [place.streetNumber, place.street].filter(Boolean).join(' ')

    const name = place.name !== place.postalCode ? place.name : undefined
    const town = [place.city, place.region].filter(Boolean).join(', ')
    return street || name || town || undefined
  } catch {
    return undefined
  }
}
