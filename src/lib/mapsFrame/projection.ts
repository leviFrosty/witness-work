// Web Mercator in the unit square, as MapKit JS's map points are: what the
// app needs to draw its own pins and cards over the frame's map from the
// visible rect alone, without asking the frame each time. Imports only types,
// so the frame bundles it too.
import type {
  EdgePadding,
  LatLng,
  Point,
  Region,
  Size,
  WorldRect,
} from './protocol'

/** Web Mercator's latitude limit, where the square ends. */
export const MAX_LATITUDE = 85.05112878

const clampLatitude = (latitude: number) =>
  Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude))

/** A coordinate's place in the unit square. */
export function toWorld({ latitude, longitude }: LatLng): Point {
  const sin = Math.sin((clampLatitude(latitude) * Math.PI) / 180)
  return {
    x: (longitude + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  }
}

/** The coordinate at a place in the unit square. */
export function fromWorld({ x, y }: Point): LatLng {
  const longitude = x * 360 - 180
  const latitude = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI
  // Keep longitude in range when the view spans the antimeridian.
  const wrapped = ((((longitude + 180) % 360) + 360) % 360) - 180
  return { latitude, longitude: wrapped }
}

/** Where `coordinate` is drawn in a view of `size` showing `rect`. */
export function pointFor(
  coordinate: LatLng,
  rect: WorldRect,
  size: Size
): Point {
  const world = toWorld(coordinate)
  let dx = world.x - rect.x
  // The nearest copy of the world, for a view across the antimeridian.
  if (dx < -0.5) dx += 1
  else if (dx > 1.5) dx -= 1
  return {
    x: (dx / rect.width) * size.width,
    y: ((world.y - rect.y) / rect.height) * size.height,
  }
}

/** The coordinate drawn at `point` in a view of `size` showing `rect`. */
export function coordinateFor(
  point: Point,
  rect: WorldRect,
  size: Size
): LatLng {
  return fromWorld({
    x: rect.x + (point.x / size.width) * rect.width,
    y: rect.y + (point.y / size.height) * rect.height,
  })
}

/** The region a rect shows: its center, and the span edge to edge. */
export function regionFor(rect: WorldRect): Region {
  const center = fromWorld({
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  })
  const north = fromWorld({ x: rect.x, y: rect.y }).latitude
  const south = fromWorld({ x: rect.x, y: rect.y + rect.height }).latitude
  return {
    ...center,
    latitudeDelta: north - south,
    longitudeDelta: Math.min(360, rect.width * 360),
  }
}

/**
 * The rect a view of `size` shows for `region`: the region's center in the
 * middle, and the whole region in view, as MapKit fits a region whose aspect
 * differs from the view's.
 */
export function rectFor(region: Region, size: Size): WorldRect {
  const center = toWorld(region)
  const north = toWorld({
    latitude: region.latitude + region.latitudeDelta / 2,
    longitude: region.longitude,
  }).y
  const south = toWorld({
    latitude: region.latitude - region.latitudeDelta / 2,
    longitude: region.longitude,
  }).y
  const spanX = Math.min(1, region.longitudeDelta / 360)
  const spanY = Math.max(south - north, 1e-9)
  const aspect = size.width / Math.max(size.height, 1)
  // Grow the narrower side to the view's aspect.
  const width = Math.max(spanX, spanY * aspect)
  const height = width / aspect
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
  }
}

/**
 * The rect that shows every coordinate inside `padding`, centered on them, and
 * never narrower than `minWidth` (street level by default), so one point
 * doesn't zoom into a building.
 */
export function rectFitting(
  coordinates: LatLng[],
  size: Size,
  padding: EdgePadding,
  minWidth = 1 / 2 ** 19
): WorldRect | null {
  if (coordinates.length === 0) return null
  const points = coordinates.map(toWorld)
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const innerWidth = Math.max(size.width - padding.left - padding.right, 1)
  const innerHeight = Math.max(size.height - padding.top - padding.bottom, 1)
  // World units per pixel that fit both spans inside the padding.
  const scale = Math.max(
    (maxX - minX) / innerWidth,
    (maxY - minY) / innerHeight,
    minWidth / size.width
  )
  const width = scale * size.width
  const height = scale * size.height
  // The padded box's center sits on the points' center.
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  return {
    x: centerX - (padding.left + innerWidth / 2) * scale,
    y: centerY - (padding.top + innerHeight / 2) * scale,
    width,
    height,
  }
}
