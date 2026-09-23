import type MapView from 'react-native-maps'
import type { LatLng } from 'react-native-maps'

export function fitMapToCoordinates(
  map: MapView | null,
  coordinates: LatLng[]
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
    // A single-point bounding box zooms Google Maps all the way into a building.
    map.animateToRegion(
      { ...first, latitudeDelta: 0.005, longitudeDelta: 0.005 },
      225
    )
    return
  }

  // Coordinates do not depend on native marker children having mounted yet.
  map.fitToCoordinates(coordinates)
}
