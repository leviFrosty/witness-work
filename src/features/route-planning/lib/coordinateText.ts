import type { Coordinate } from '@/types/contact'

export const coordinateText = ({ latitude, longitude }: Coordinate) =>
  `${latitude},${longitude}`
