import type { LatLng, Size, WorldRect } from '@/lib/mapsFrame/protocol'
import { pointFor } from '@/lib/mapsFrame/projection'

/** The part of an element `placeAll` touches: its inline style. */
export type Placeable = {
  style: { transform: string; visibility: string }
}

export type OverlayEntry = {
  node: Placeable
  coordinate: LatLng
  /** The point of the view on the coordinate, as fractions of its size. */
  anchor: { x: number; y: number }
  /** Moves the view by this much, in points (iOS's `centerOffset`). */
  offset: { x: number; y: number }
  /** The view's size, once laid out. */
  size: Size | null
}

/** A view this far outside the map is hidden rather than moved. */
const MARGIN = 200

/**
 * Where the app's own pins and cards go over the frame's map. Each move of the
 * map moves every view straight through its style, every frame, so a pan
 * doesn't re-render React.
 */
export function createOverlayLayout() {
  let rect: WorldRect | null = null
  let size: Size | null = null
  const entries = new Set<OverlayEntry>()

  const place = (entry: OverlayEntry) => {
    const { node } = entry
    if (!rect || !size || !entry.size) {
      node.style.visibility = 'hidden'
      return
    }
    const point = pointFor(entry.coordinate, rect, size)
    const x = point.x - entry.anchor.x * entry.size.width + entry.offset.x
    const y = point.y - entry.anchor.y * entry.size.height + entry.offset.y
    const outside =
      x > size.width + MARGIN ||
      y > size.height + MARGIN ||
      x + entry.size.width < -MARGIN ||
      y + entry.size.height < -MARGIN
    node.style.visibility = outside ? 'hidden' : 'visible'
    if (!outside)
      node.style.transform = `translate(${Math.round(x * 2) / 2}px, ${Math.round(y * 2) / 2}px)`
  }

  return {
    /** The map moved, or resized. */
    update(nextRect: WorldRect, nextSize: Size) {
      rect = nextRect
      size = nextSize
      entries.forEach(place)
    },
    add(entry: OverlayEntry) {
      entries.add(entry)
      place(entry)
      return () => {
        entries.delete(entry)
      }
    },
    place,
    current: () => (rect && size ? { rect, size } : null),
  }
}

export type OverlayLayout = ReturnType<typeof createOverlayLayout>

/**
 * A marker's anchor and offset, as react-native-maps places a custom view:
 * `anchor` when given (Google Maps), else centered and moved by `centerOffset`
 * (Apple Maps).
 */
export function markerPlacement({
  anchor,
  centerOffset,
}: {
  anchor?: { x: number; y: number }
  centerOffset?: { x: number; y: number }
}): Pick<OverlayEntry, 'anchor' | 'offset'> {
  if (anchor) return { anchor, offset: { x: 0, y: 0 } }
  return { anchor: { x: 0.5, y: 0.5 }, offset: centerOffset ?? { x: 0, y: 0 } }
}
