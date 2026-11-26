import { reverseGeocodeCoordinate } from '@/lib/reverseGeocode'
import { usePreferences } from '@/stores/preferences'
import type { Coordinate } from '@/types/contact'

export async function pinTitle(
  coordinate: Coordinate
): Promise<string | undefined> {
  if (usePreferences.getState().dataProtectionMode) return undefined
  const resolved = await reverseGeocodeCoordinate(coordinate)
  if (!resolved) return undefined
  const { address } = resolved
  const town = [address.city, address.state].filter(Boolean).join(', ')
  return address.line1 || town || resolved.formattedAddress || undefined
}
