import * as Location from 'expo-location'
import type { Coordinate } from '@/types/contact'

/**
 * A name for a dropped pin: its street address, the place's name, or its town.
 * None when the lookup finds nothing or fails; the coordinates stand in.
 */
export async function pinTitle(
  coordinate: Coordinate
): Promise<string | undefined> {
  try {
    const [place] = await Location.reverseGeocodeAsync(coordinate)
    if (!place) return undefined
    const street = [place.streetNumber, place.street].filter(Boolean).join(' ')
    // Away from streets the "name" is often just the postal code.
    const name = place.name !== place.postalCode ? place.name : undefined
    const town = [place.city, place.region].filter(Boolean).join(', ')
    return street || name || town || undefined
  } catch {
    return undefined
  }
}
