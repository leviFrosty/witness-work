import type { Coordinate } from '@/types/contact'
import { startNumber } from '@/features/territories/lib/doors'
import {
  cleanHouses,
  firstKnownHouse,
} from '@/features/territories/lib/houseList'
import {
  areaCentroid,
  isOutline,
} from '@/features/territories/lib/territoryArea'
import type { TerritoryStreet } from '@/features/territories/types/territory'

export const MAX_SAMPLE_POINTS = 25

const METRES_PER_DEGREE = 111_320
const MAX_EDGE_POINTS = 12
const EDGE_SPACING = 120
const MIN_GRID_SPACING = 70

type Flat = { x: number; y: number }

const projection = (origin: Coordinate) => {
  const east = METRES_PER_DEGREE * Math.cos(origin.latitude * (Math.PI / 180))
  return {
    flat: (point: Coordinate): Flat => ({
      x: (point.longitude - origin.longitude) * east,
      y: (point.latitude - origin.latitude) * METRES_PER_DEGREE,
    }),
    coordinate: (point: Flat): Coordinate => ({
      latitude: origin.latitude + point.y / METRES_PER_DEGREE,
      longitude: origin.longitude + point.x / east,
    }),
  }
}

const inside = (point: Flat, polygon: readonly Flat[]) => {
  let within = false
  for (let index = 0, last = polygon.length - 1; index < polygon.length; ) {
    const a = polygon[index]!
    const b = polygon[last]!
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      within = !within
    last = index
    index += 1
  }
  return within
}

const edgePoints = (polygon: readonly Flat[], count: number): Flat[] => {
  const edges = polygon.map((from, index) => {
    const to = polygon[(index + 1) % polygon.length]!
    return { from, to, length: Math.hypot(to.x - from.x, to.y - from.y) }
  })
  const perimeter = edges.reduce((sum, edge) => sum + edge.length, 0)
  if (perimeter === 0 || count === 0) return []
  const step = perimeter / count
  const points: Flat[] = []
  let walked = 0
  let target = step / 2
  for (const edge of edges) {
    while (target <= walked + edge.length && points.length < count) {
      const along = edge.length === 0 ? 0 : (target - walked) / edge.length
      points.push({
        x: edge.from.x + (edge.to.x - edge.from.x) * along,
        y: edge.from.y + (edge.to.y - edge.from.y) * along,
      })
      target += step
    }
    walked += edge.length
  }
  return points
}

const gridPoints = (polygon: readonly Flat[], budget: number): Flat[] => {
  if (budget <= 0) return []
  const xs = polygon.map((point) => point.x)
  const ys = polygon.map((point) => point.y)
  const west = Math.min(...xs)
  const east = Math.max(...xs)
  const south = Math.min(...ys)
  const north = Math.max(...ys)
  const area = (east - west) * (north - south)
  let spacing = Math.max(MIN_GRID_SPACING, Math.sqrt(area / budget))
  for (let attempt = 0; attempt < 40; attempt++) {
    const points: Flat[] = []
    for (let y = south + spacing / 2; y < north; y += spacing)
      for (let x = west + spacing / 2; x < east; x += spacing)
        if (inside({ x, y }, polygon)) points.push({ x, y })
    if (points.length <= budget) return points
    spacing *= 1.15
  }
  return []
}

const interleave = <T>(first: readonly T[], second: readonly T[]): T[] => {
  const mixed: T[] = []
  for (let index = 0; index < Math.max(first.length, second.length); index++) {
    if (index < first.length) mixed.push(first[index]!)
    if (index < second.length) mixed.push(second[index]!)
  }
  return mixed
}

export const outlineSamplePoints = (
  outline: readonly Coordinate[] | undefined,
  max = MAX_SAMPLE_POINTS
): Coordinate[] => {
  if (!isOutline(outline) || max <= 0) return []
  const origin = areaCentroid(outline) ?? outline[0]!
  const { flat, coordinate } = projection(origin)
  const polygon = outline.map(flat)
  const perimeter = polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length]!
    return sum + Math.hypot(next.x - point.x, next.y - point.y)
  }, 0)
  const edgeCount = Math.min(
    MAX_EDGE_POINTS,
    max,
    Math.max(polygon.length, Math.ceil(perimeter / EDGE_SPACING))
  )
  const edges = edgePoints(polygon, edgeCount)
  const grid = gridPoints(polygon, max - edges.length)
  return interleave(edges, grid).slice(0, max).map(coordinate)
}

const SUFFIXES: Record<string, string> = {
  street: 'st',
  avenue: 'ave',
  av: 'ave',
  road: 'rd',
  drive: 'dr',
  lane: 'ln',
  boulevard: 'blvd',
  court: 'ct',
  place: 'pl',
  terrace: 'ter',
  circle: 'cir',
  parkway: 'pkwy',
  highway: 'hwy',
  trail: 'trl',
  square: 'sq',
  crescent: 'cres',
  north: 'n',
  south: 's',
  east: 'e',
  west: 'w',
}

export const streetKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.,'’]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => SUFFIXES[word] ?? word)
    .join(' ')

export const addStreetName = (
  found: readonly string[],
  name: string | null | undefined
): readonly string[] => {
  const trimmed = name?.trim()
  if (!trimmed) return found
  const key = streetKey(trimmed)
  return found.some((had) => streetKey(had) === key)
    ? found
    : [...found, trimmed]
}

export const newStreetNames = (
  found: readonly string[],
  streets: readonly Pick<TerritoryStreet, 'name'>[]
): string[] => {
  const known = new Set(streets.map((street) => streetKey(street.name)))
  return found.filter((name) => !known.has(streetKey(name)))
}

export const suggestedStreet = (
  id: string,
  name: string,
  found?: readonly string[]
): TerritoryStreet => {
  const numbering = 'both'
  const houses = found && found.length > 0 ? cleanHouses(found) : undefined
  const from = startNumber(
    numbering,
    houses && firstKnownHouse({ numbering, houses })
  )
  return {
    id,
    name: name.trim(),
    numbering,
    next: from,
    first: from,
    descending: undefined,
    ...(houses && houses.length > 0 && { houses }),
    doors: [],
    workedAt: undefined,
    saveLocations: undefined,
  }
}

export type StreetSearch = {
  names: readonly string[]
  checked: number
  total: number
  stopped: boolean
  done: boolean
}

export const findOutlineStreets = async ({
  points,
  geocode,
  onProgress,
  cancelled,
  pause,
}: {
  points: readonly Coordinate[]
  geocode: (point: Coordinate) => Promise<readonly { street?: string | null }[]>
  onProgress: (search: StreetSearch) => void
  cancelled: () => boolean
  pause?: () => Promise<void>
}): Promise<StreetSearch> => {
  let search: StreetSearch = {
    names: [],
    checked: 0,
    total: points.length,
    stopped: false,
    done: false,
  }
  for (const [index, point] of points.entries()) {
    if (cancelled()) return search
    if (index > 0 && pause) await pause()
    if (cancelled()) return search
    try {
      const places = await geocode(point)
      search = {
        ...search,
        checked: search.checked + 1,
        names: places.reduce(
          (found, place) => addStreetName(found, place.street),
          search.names
        ),
      }
    } catch {
      search = { ...search, stopped: true, done: true }
      onProgress(search)
      return search
    }
    if (cancelled()) return search
    onProgress(search)
  }
  search = { ...search, done: true }
  onProgress(search)
  return search
}
