import type { LatLng, Size, WorldRect } from '@/lib/mapsFrame/protocol'
import { pointFor } from '@/lib/mapsFrame/projection'

export type Placeable = {
  style: { transform: string; visibility: string }
}

export type OverlayEntry = {
  node: Placeable
  coordinate: LatLng

  anchor: { x: number; y: number }

  offset: { x: number; y: number }

  size: Size | null
}

const MARGIN = 200

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
