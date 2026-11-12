import { Polygon } from 'react-native-maps'
import type { Coordinate } from '@/types/contact'

export default function TerritoryOutlineShape({
  outline,
  color,
}: {
  outline: readonly Coordinate[]
  color: string
}) {
  return (
    <Polygon
      coordinates={[...outline]}
      strokeColor={color}
      strokeWidth={3}
      fillColor={`${color}2E`}
      tappable={false}
    />
  )
}
