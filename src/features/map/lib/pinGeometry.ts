import { distanceMeters } from '@/lib/geo'
import type { Coordinate } from '@/types/contact'

/** A point on the map, in points from its top left. */
export type MapPoint = { x: number; y: number }

export type ScreenPin = MapPoint & { id: string }

/**
 * Gathers pins that sit on top of each other on screen into groups. `pins` come
 * most pressing first; each one not yet in a group starts one and takes in
 * every free pin within `radius`. A grid keeps it linear in the pin count.
 */
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

/** Within this, a group is one place (a building) rather than a crowd. */
export const SAME_PLACE_M = 40

/** Every member sits within `SAME_PLACE_M` of the first. */
export const isSamePlace = (coordinates: Coordinate[]) =>
  coordinates.every(
    (coordinate) => distanceMeters(coordinates[0]!, coordinate) <= SAME_PLACE_M
  )

/** Whether a point is inside a polygon (ray casting; edges are straight). */
export const pointInPolygon = (point: MapPoint, polygon: MapPoint[]) => {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside
    }
  }
  return inside
}

/**
 * The ids of the Contacts whose pins sit inside a loop drawn over the map, in
 * the order given. Fewer than three points don't make a loop.
 */
export const contactsInLoop = (
  contacts: { id: string; coordinate?: Coordinate }[],
  loop: MapPoint[],
  project: (coordinate: Coordinate) => MapPoint
): string[] =>
  loop.length < 3
    ? []
    : contacts
        .filter(
          (contact) =>
            !!contact.coordinate &&
            pointInPolygon(project(contact.coordinate), loop)
        )
        .map((contact) => contact.id)
