import type MapView from 'react-native-maps'
import type { LatLng } from 'react-native-maps'

export function fitMapToCoordinates(
  map: MapView | null,
  coordinates: LatLng[],
  { animated = true }: { animated?: boolean } = {}
) {
  if (!map || coordinates.length === 0) return

  const first = coordinates[0]
  if (
    coordinates.every(
      (coordinate) =>
        coordinate.latitude === first.latitude &&
        coordinate.longitude === first.longitude
    )
  ) {
    map.animateToRegion(
      { ...first, latitudeDelta: 0.005, longitudeDelta: 0.005 },
      animated ? 225 : 0
    )
    return
  }

  map.fitToCoordinates(coordinates, { animated })
}
