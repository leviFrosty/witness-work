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

type Rect = { left: number; top: number; right: number; bottom: number }

const overlaps = (a: Rect, b: Rect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/** Roughly how wide a two-line card is, from its longer line. */
export const estimateCardWidth = (
  lines: string[],
  { min = 56, max = 132, perChar = 6.4, padding = 16 } = {}
) =>
  Math.max(
    min,
    Math.min(
      max,
      padding + perChar * Math.max(0, ...lines.map((l) => l.length))
    )
  )

/**
 * Where each pin's card goes so cards never cover another pin or card, or run
 * off the map: above the pin if there's room, else below, else nowhere until
 * the User zooms in. Earlier candidates get first pick.
 */
export const placeLabels = (
  candidates: LabelCandidate[],
  region: MapRegion,
  size: MapSize,
  { cardHeight, gap, pin }: LabelMetrics
): Map<string, 'above' | 'below' | 'none'> => {
  const points = candidates.map((candidate) => ({
    ...candidate,
    ...projectToMap(candidate.coordinate, region, size),
  }))
  const pins: (Rect & { key: string })[] = points.map(({ key, x, y }) => ({
    key,
    left: x - pin / 2,
    right: x + pin / 2,
    top: y - pin / 2,
    bottom: y + pin / 2,
  }))
  const cards: Rect[] = []
  const placements = new Map<string, 'above' | 'below' | 'none'>()

  for (const { key, x, y, width } of points) {
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
          top: aboveBottom - cardHeight,
          bottom: aboveBottom,
        },
      },
      {
        placement: 'below' as const,
        rect: { left, right, top: belowTop, bottom: belowTop + cardHeight },
      },
    ]
    const free = options.find(
      ({ rect }) =>
        rect.top >= 0 &&
        rect.bottom <= size.height &&
        rect.left >= 0 &&
        rect.right <= size.width &&
        !pins.some((other) => other.key !== key && overlaps(rect, other)) &&
        !cards.some((other) => overlaps(rect, other))
    )
    if (free) cards.push(free.rect)
    placements.set(key, free?.placement ?? 'none')
  }
  return placements
}
