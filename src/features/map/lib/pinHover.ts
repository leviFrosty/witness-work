export type Point = { x: number; y: number }
export type Rect = { x: number; y: number; width: number; height: number }
/** Visible map area, in map points, that a pin label may occupy. */
export type Bounds = {
  left: number
  top: number
  right: number
  bottom: number
}

/** A pin's balloon in map points, plus the point its tip marks. */
export type PinBox = { id: string; box: Rect; point: Point }

/** Shape of `MapView.getMarkersFrames()`: entries keyed by marker identifier. */
export type MarkerFrames = Record<string, { point: Point; frame: Rect }>

// A default MapKit balloon sits above its coordinate: about 15pt either side
// and 45pt tall, its tip a few points below the coordinate.
const FALLBACK_BOX = { left: 15, right: 15, above: 45, below: 5 }

/**
 * Turns native marker frames into hit boxes for the given contacts. The native
 * annotation frame is exact; if it looks unrelated to the pin's point (e.g. a
 * not-yet-laid-out view), fall back to a default balloon around the point.
 */
export function toPinBoxes(
  frames: MarkerFrames,
  ids: ReadonlySet<string>
): PinBox[] {
  const boxes: PinBox[] = []
  for (const [id, { point, frame }] of Object.entries(frames)) {
    if (!ids.has(id)) continue
    const usable =
      frame.width > 0 &&
      frame.height > 0 &&
      point.x >= frame.x - 1 &&
      point.x <= frame.x + frame.width + 1
    boxes.push({
      id,
      point,
      box: usable
        ? frame
        : {
            x: point.x - FALLBACK_BOX.left,
            y: point.y - FALLBACK_BOX.above,
            width: FALLBACK_BOX.left + FALLBACK_BOX.right,
            height: FALLBACK_BOX.above + FALLBACK_BOX.below,
          },
    })
  }
  return boxes
}

/**
 * The pin under the pointer. Where balloons overlap, the southernmost one
 * (lowest on screen) wins: MapKit draws it in front.
 */
export function hitTestPins(
  pins: readonly PinBox[],
  pointer: Point,
  slop = 2
): PinBox | undefined {
  let hit: PinBox | undefined
  for (const pin of pins) {
    const { x, y, width, height } = pin.box
    if (
      pointer.x >= x - slop &&
      pointer.x <= x + width + slop &&
      pointer.y >= y - slop &&
      pointer.y <= y + height + slop &&
      (!hit || pin.point.y >= hit.point.y)
    )
      hit = pin
  }
  return hit
}

/** Whether a pin's tip sits inside the visible map area. */
export function isPinInBounds(pin: PinBox, bounds: Bounds) {
  return (
    pin.point.x >= bounds.left &&
    pin.point.x <= bounds.right &&
    pin.point.y >= bounds.top &&
    pin.point.y <= bounds.bottom
  )
}

const LABEL_GAP = 6
const LABEL_EDGE = 8

/**
 * Centres a label above its pin, kept inside the visible map area. When there
 * is no room above, it drops below the pin's tip instead of covering it.
 */
export function placePinLabel(
  box: Rect,
  size: { width: number; height: number },
  bounds: Bounds
): { left: number; top: number } {
  const centredLeft = box.x + box.width / 2 - size.width / 2
  const minLeft = bounds.left + LABEL_EDGE
  const maxLeft = Math.max(minLeft, bounds.right - size.width - LABEL_EDGE)
  const above = box.y - LABEL_GAP - size.height
  return {
    left: Math.min(Math.max(centredLeft, minLeft), maxLeft),
    top:
      above >= bounds.top + LABEL_EDGE ? above : box.y + box.height + LABEL_GAP,
  }
}
