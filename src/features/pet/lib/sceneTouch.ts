import type { Viewport } from '@/lib/pixelArt'

export type SceneTapTarget = 'gift' | 'pet' | 'room'

export const PET_TAP_PAD = 3

export const PET_RUB_PAD = 6

export function inBox(sx: number, sy: number, box: Viewport, pad = 0): boolean {
  return (
    sx >= box[0] - pad &&
    sx < box[0] + box[2] + pad &&
    sy >= box[1] - pad &&
    sy < box[1] + box[3] + pad
  )
}

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
