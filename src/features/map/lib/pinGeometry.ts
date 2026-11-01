import { distanceMeters } from '@/lib/geo'
import type { Coordinate } from '@/types/contact'

export type MapPoint = { x: number; y: number }

export type ScreenPin = MapPoint & { id: string }

export const groupOverlappingPins = <P extends ScreenPin>(
  pins: P[],
  radius: number
): P[][] => {
  const cell = (value: number) => Math.floor(value / radius)
  const grid = new Map<string, P[]>()
  for (const pin of pins) {
    const key = `${cell(pin.x)},${cell(pin.y)}`
    const bucket = grid.get(key)
    if (bucket) bucket.push(pin)
    else grid.set(key, [pin])
  }
  const taken = new Set<string>()
  const groups: P[][] = []
  for (const seed of pins) {
    if (taken.has(seed.id)) continue
    taken.add(seed.id)
    const group = [seed]
    const cx = cell(seed.x)
    const cy = cell(seed.y)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (taken.has(other.id)) continue
          if (Math.hypot(other.x - seed.x, other.y - seed.y) > radius) continue
          taken.add(other.id)
          group.push(other)
        }
      }
    }
    groups.push(group)
  }
  return groups
}

export const SAME_PLACE_M = 40

export const isSamePlace = (coordinates: Coordinate[]) =>
  coordinates.every(
    (coordinate) => distanceMeters(coordinates[0]!, coordinate) <= SAME_PLACE_M
  )
