import type { Coordinate } from '@/types/contact'

/** `lat,lng`, as navigation apps and Google Maps waypoints accept it. */
export const coordinateText = ({ latitude, longitude }: Coordinate) =>
  `${latitude},${longitude}`
