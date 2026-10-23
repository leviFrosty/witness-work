import type { Coordinate } from '@/types/contact'

/** The visible part of the map: its center and span in degrees. */
export type MapRegion = Coordinate & {
  latitudeDelta: number
  longitudeDelta: number
}

export type MapSize = { width: number; height: number }

/** A pin that would like its card shown, in priority order. */
export type LabelCandidate = {
  key: string
  coordinate: Coordinate
  /** The card's estimated width in points. */
  width: number
  /** The card's height, when it isn't `LabelMetrics.cardHeight`. */
  height?: number
  /** Only a pin; its card never shows, but other cards keep clear of it. */
  pinOnly?: boolean
}

export type LabelMetrics = {
  cardHeight: number
  /** Space between the card's bottom and the pin's top. */
  gap: number
  pin: number
}

const mercatorY = (latitude: number) => {
  const phi = (Math.max(-85, Math.min(85, latitude)) * Math.PI) / 180
  return Math.log(Math.tan(Math.PI / 4 + phi / 2))
}

/** Where a coordinate lands on the map, in points from its top left. */
export const projectToMap = (
  coordinate: Coordinate,
  region: MapRegion,
  size: MapSize
): { x: number; y: number } => {
  const west = region.longitude - region.longitudeDelta / 2
  const north = mercatorY(region.latitude + region.latitudeDelta / 2)
  const south = mercatorY(region.latitude - region.latitudeDelta / 2)
  return {
    x: ((coordinate.longitude - west) / region.longitudeDelta) * size.width,
    y:
      ((north - mercatorY(coordinate.latitude)) / (north - south)) *
      size.height,
  }
}

/** A coordinate and where the map draws it. */
export type ReferencePoint = {
  coordinate: Coordinate
  point: { x: number; y: number }
}

/**
 * Projects coordinates the way a north-up map does, from two coordinates the
 * map itself placed (e.g. by `pointForCoordinate`). Unlike `projectToMap`, this
 * holds however the map pads or reports its region. Null when the two points
 * don't span both directions.
 */
export const projectionFrom = (
  a: ReferencePoint,
  b: ReferencePoint
): ((coordinate: Coordinate) => { x: number; y: number }) | null => {
  const dLon = b.coordinate.longitude - a.coordinate.longitude
  const dMerc =
    mercatorY(b.coordinate.latitude) - mercatorY(a.coordinate.latitude)
  if (Math.abs(dLon) < 1e-12 || Math.abs(dMerc) < 1e-12) return null
  const xPerLon = (b.point.x - a.point.x) / dLon
  const yPerMerc = (b.point.y - a.point.y) / dMerc
  const aMerc = mercatorY(a.coordinate.latitude)
  return (coordinate) => ({
    x: a.point.x + (coordinate.longitude - a.coordinate.longitude) * xPerLon,
    y: a.point.y + (mercatorY(coordinate.latitude) - aMerc) * yPerMerc,
  })
}

export type Rect = { left: number; top: number; right: number; bottom: number }

const overlaps = (a: Rect, b: Rect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

// East Asian wide and fullwidth characters (Han, kana, Hangul, fullwidth
// forms) draw about as wide as two Latin letters.
const WIDE_CHARACTER =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{20000}-\u{3fffd}]/u

/** A line's length in Latin letters' widths. */
const textWidth = (text: string) => {
  let width = 0
  for (const character of text) width += WIDE_CHARACTER.test(character) ? 2 : 1
  return width
}

/** Roughly how wide a two-line card is, from its longer line. */
export const estimateCardWidth = (
  lines: string[],
  { min = 56, max = 132, perChar = 6.4, padding = 16 } = {}
) =>
  Math.max(
    min,
    Math.min(max, padding + perChar * Math.max(0, ...lines.map(textWidth)))
  )

/** A label candidate already projected to map points. */
export type ProjectedCandidate = LabelCandidate & { x: number; y: number }

type PlaceOptions = {
  maxCards?: number
  bounds?: Rect
  /** Controls floating over the map that cards keep clear of. */
  avoid?: Rect[]
}

/**
 * Where each pin's card goes so cards never cover another pin or card, or run
 * off the map: above the pin if there's room, else below, else nowhere until
 * the User zooms in. Earlier candidates get first pick, and once `maxCards` are
 * placed the rest wait too. `bounds` keeps cards out from under whatever floats
 * over the map's edges.
 */
export const placeLabels = (
  candidates: LabelCandidate[],
  region: MapRegion,
  size: MapSize,
  metrics: LabelMetrics,
  options: PlaceOptions = {}
): Map<string, 'above' | 'below' | 'none'> =>
  placeProjectedLabels(
    candidates.map((candidate) => ({
      ...candidate,
      ...projectToMap(candidate.coordinate, region, size),
    })),
    size,
    metrics,
    options
  )

/** `placeLabels` for candidates whose map points are already known. */
export const placeProjectedLabels = (
  points: ProjectedCandidate[],
  size: MapSize,
  { cardHeight, gap, pin }: LabelMetrics,
  {
    maxCards = Infinity,
    bounds = { left: 0, top: 0, right: size.width, bottom: size.height },
    avoid = [],
  }: PlaceOptions = {}
): Map<string, 'above' | 'below' | 'none'> => {
  const pins: (Rect & { key: string })[] = points.map(({ key, x, y }) => ({
    key,
    left: x - pin / 2,
    right: x + pin / 2,
    top: y - pin / 2,
    bottom: y + pin / 2,
  }))
  const cards: Rect[] = [...avoid]
  const placements = new Map<string, 'above' | 'below' | 'none'>()

  for (const { key, x, y, width, height = cardHeight, pinOnly } of points) {
    if (pinOnly || cards.length - avoid.length >= maxCards) {
      placements.set(key, 'none')
      continue
    }
    const left = x - width / 2
    const right = x + width / 2
    const aboveBottom = y - pin / 2 - gap
    const belowTop = y + pin / 2 + gap
    const options = [
      {
        placement: 'above' as const,
        rect: {
          left,
          right,
          top: aboveBottom - height,
          bottom: aboveBottom,
        },
      },
      {
        placement: 'below' as const,
        rect: { left, right, top: belowTop, bottom: belowTop + height },
      },
    ]
    const free = options.find(
      ({ rect }) =>
        rect.top >= bounds.top &&
        rect.bottom <= bounds.bottom &&
        rect.left >= bounds.left &&
        rect.right <= bounds.right &&
        !pins.some((other) => other.key !== key && overlaps(rect, other)) &&
        !cards.some((other) => overlaps(rect, other))
    )
    if (free) cards.push(free.rect)
    placements.set(key, free?.placement ?? 'none')
  }
  return placements
}
