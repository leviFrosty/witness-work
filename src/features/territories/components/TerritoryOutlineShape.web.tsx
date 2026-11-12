import { Polyline } from 'react-native-maps'
import type { Coordinate } from '@/types/contact'

export default function TerritoryOutlineShape({
  outline,
  color,
}: {
  outline: readonly Coordinate[]
  color: string
}) {
  const first = outline[0]
  return (
    <Polyline
      coordinates={first ? [...outline, first] : []}
      strokeColor={color}
      strokeWidth={3}
    />
  )
}
