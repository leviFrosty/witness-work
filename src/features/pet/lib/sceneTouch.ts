import type { Viewport } from '@/lib/pixelArt'

/** What a tap on the room landed on. */
export type SceneTapTarget = 'gift' | 'pet' | 'room'

/** Scene pixels added around the pet, so a fingertip on its edge still pats. */
export const PET_TAP_PAD = 3
/** A rub may start a little further out than a tap. */
export const PET_RUB_PAD = 6

/** Whether scene point (`sx`, `sy`) is inside `box` grown by `pad`. */
export function inBox(sx: number, sy: number, box: Viewport, pad = 0): boolean {
  return (
    sx >= box[0] - pad &&
    sx < box[0] + box[2] + pad &&
    sy >= box[1] - pad &&
    sy < box[1] + box[3] + pad
  )
}

/**
 * Where a tap at view point (`x`, `y`) landed: the gift on the rug, the pet
 * (its drawn box, padded by {@link PET_TAP_PAD}), or anywhere else in the room.
 * `scale` is view points per scene pixel; a point outside the picture is the
 * room.
 */
export function sceneTapTarget({
  x,
  y,
  scale,
  viewport,
  petBox,
  giftBox,
}: {
  x: number
  y: number
  scale: number
  viewport: Viewport
  petBox: Viewport | null
  giftBox: Viewport | null
}): SceneTapTarget {
  if (scale <= 0) return 'room'
  if (x < 0 || y < 0 || x >= viewport[2] * scale || y >= viewport[3] * scale)
    return 'room'
  const sx = viewport[0] + x / scale
  const sy = viewport[1] + y / scale
  if (giftBox && inBox(sx, sy, giftBox)) return 'gift'
  if (petBox && inBox(sx, sy, petBox, PET_TAP_PAD)) return 'pet'
  return 'room'
}

/** Whether a drag starting at view point (`x`, `y`) starts on the pet. */
export function startsOnPet({
  x,
  y,
  scale,
  viewport,
  petBox,
}: {
  x: number
  y: number
  scale: number
  viewport: Viewport
  petBox: Viewport | null
}): boolean {
  if (scale <= 0 || !petBox) return false
  return inBox(
    viewport[0] + x / scale,
    viewport[1] + y / scale,
    petBox,
    PET_RUB_PAD
  )
}
