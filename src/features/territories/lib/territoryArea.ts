import { coordinateFor, pointFor, rectFor } from '@/lib/mapsFrame/projection'
import type { Coordinate } from '@/types/contact'
import type { Territory } from '@/features/territories/types/territory'

export type AreaBounds = {
  south: number
  north: number
  west: number
  east: number
}

export type MapRegion = {
  latitude: number
  longitude: number
  latitudeDelta: number
  longitudeDelta: number
}

const METERS_PER_DEGREE = 111_320

export const MIN_OUTLINE_CORNERS = 3

export const isOutline = (
  outline: readonly Coordinate[] | undefined
): outline is readonly Coordinate[] =>
  !!outline && outline.length >= MIN_OUTLINE_CORNERS

export const areaBounds = (
  points: readonly Coordinate[]
): AreaBounds | undefined => {
  if (points.length === 0) return undefined
  const latitudes = points.map((point) => point.latitude)
  const longitudes = points.map((point) => point.longitude)
  return {
    south: Math.min(...latitudes),
    north: Math.max(...latitudes),
    west: Math.min(...longitudes),
    east: Math.max(...longitudes),
  }
}

const average = (points: readonly Coordinate[]): Coordinate => ({
  latitude:
    points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
  longitude:
    points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
})

export const areaCentroid = (
  outline: readonly Coordinate[]
): Coordinate | undefined => {
  if (outline.length === 0) return undefined
  if (outline.length < MIN_OUTLINE_CORNERS) return average(outline)
  const origin = outline[0]!
  let twiceArea = 0
  let x = 0
  let y = 0
  outline.forEach((point, index) => {
    const next = outline[(index + 1) % outline.length]!
    const x0 = point.longitude - origin.longitude
    const y0 = point.latitude - origin.latitude
    const x1 = next.longitude - origin.longitude
    const y1 = next.latitude - origin.latitude
    const cross = x0 * y1 - x1 * y0
    twiceArea += cross
    x += (x0 + x1) * cross
    y += (y0 + y1) * cross
  })
  if (Math.abs(twiceArea) < 1e-14) return average(outline)
  return {
    latitude: origin.latitude + y / (3 * twiceArea),
    longitude: origin.longitude + x / (3 * twiceArea),
  }
}

export const pointInArea = (
  point: Coordinate,
  outline: readonly Coordinate[]
): boolean => {
  if (!isOutline(outline)) return false
  let inside = false
  for (
    let index = 0, previous = outline.length - 1;
    index < outline.length;
    previous = index++
  ) {
    const a = outline[index]!
    const b = outline[previous]!
    const crosses =
      a.latitude > point.latitude !== b.latitude > point.latitude &&
      point.longitude <
        ((b.longitude - a.longitude) * (point.latitude - a.latitude)) /
          (b.latitude - a.latitude) +
          a.longitude
    if (crosses) inside = !inside
  }
  return inside
}

const toMeters = (point: Coordinate, latitude: number) => ({
  x: point.longitude * METERS_PER_DEGREE * Math.cos((latitude * Math.PI) / 180),
  y: point.latitude * METERS_PER_DEGREE,
})

const segmentDistance = (
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t =
    length === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)
        )
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

export const distanceToArea = (
  point: Coordinate,
  outline: readonly Coordinate[]
): number | undefined => {
  if (outline.length === 0) return undefined
  if (pointInArea(point, outline)) return 0
  const latitude = point.latitude
  const here = toMeters(point, latitude)
  const corners = outline.map((corner) => toMeters(corner, latitude))
  if (corners.length === 1)
    return segmentDistance(here, corners[0]!, corners[0]!)
  return Math.min(
    ...corners.map((corner, index) =>
      segmentDistance(here, corner, corners[(index + 1) % corners.length]!)
    )
  )
}

export const isNearArea = (
  point: Coordinate,
  outline: readonly Coordinate[],
  meters: number
): boolean => {
  const distance = distanceToArea(point, outline)
  return distance !== undefined && distance <= meters
}

export const territoryPoint = (
  territory: Pick<Territory, 'coordinate' | 'outline'>
): Coordinate | undefined =>
  territory.coordinate ??
  (isOutline(territory.outline) ? areaCentroid(territory.outline) : undefined)

export const regionFor = (
  points: readonly Coordinate[],
  closest = 0.002,
  margin = 1.4
): MapRegion | undefined => {
  const bounds = areaBounds(points)
  if (!bounds) return undefined
  return {
    latitude: (bounds.south + bounds.north) / 2,
    longitude: (bounds.west + bounds.east) / 2,
    latitudeDelta: Math.max(closest, (bounds.north - bounds.south) * margin),
    longitudeDelta: Math.max(closest, (bounds.east - bounds.west) * margin),
  }
}

export type MapSize = { width: number; height: number }

export type ScreenPoint = { x: number; y: number }

export const cornerPoint = (
  corner: Coordinate,
  region: MapRegion,
  size: MapSize
): ScreenPoint => pointFor(corner, rectFor(region, size), size)

export const cornerAt = (
  point: ScreenPoint,
  corners: readonly Coordinate[],
  region: MapRegion,
  size: MapSize,
  radius: number
): number | undefined => {
  let found: number | undefined
  let closest = radius
  corners.forEach((corner, index) => {
    const at = cornerPoint(corner, region, size)
    const distance = Math.hypot(at.x - point.x, at.y - point.y)
    if (distance <= closest) {
      closest = distance
      found = index
    }
  })
  return found
}

export const edgeAt = (
  point: ScreenPoint,
  corners: readonly Coordinate[],
  region: MapRegion,
  size: MapSize,
  radius: number
): number | undefined => {
  if (!isOutline(corners)) return undefined
  const points = corners.map((corner) => cornerPoint(corner, region, size))
  let found: number | undefined
  let closest = radius
  points.forEach((start, index) => {
    const end = points[(index + 1) % points.length]!
    const distance = segmentDistance(point, start, end)
    if (distance <= closest) {
      closest = distance
      found = index + 1
    }
  })
  return found
}

export const insertCorner = (
  outline: readonly Coordinate[],
  index: number,
  corner: Coordinate
): Coordinate[] => [...outline.slice(0, index), corner, ...outline.slice(index)]

export const tappedAfterInsert = (
  tapped: readonly number[],
  index: number
): number[] => [...tapped.map((at) => (at >= index ? at + 1 : at)), index]

export const tappedAfterRemove = (
  tapped: readonly number[],
  index: number
): number[] =>
  tapped.filter((at) => at !== index).map((at) => (at > index ? at - 1 : at))

export const draggedCorner = (
  corner: Coordinate,
  translation: ScreenPoint,
  region: MapRegion,
  size: MapSize
): Coordinate => {
  const rect = rectFor(region, size)
  const start = pointFor(corner, rect, size)
  const { latitude, longitude } = coordinateFor(
    { x: start.x + translation.x, y: start.y + translation.y },
    rect,
    size
  )
  return { latitude, longitude }
}

export const replaceCorner = (
  outline: readonly Coordinate[],
  index: number,
  corner: Coordinate
): Coordinate[] => outline.map((had, at) => (at === index ? corner : had))

export const removeCorner = (
  outline: readonly Coordinate[],
  index: number
): Coordinate[] => outline.filter((_, at) => at !== index)
