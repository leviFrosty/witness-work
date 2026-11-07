export const MAX_IMAGE_PIXELS = 120_000_000

export const MAX_PHOTO_BYTES = 50 * 1024 * 1024

export type PixelRect = {
  originX: number
  originY: number
  width: number
  height: number
}

export function fitWithin(
  width: number,
  height: number,
  maxSide: number
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxSide) return { width, height }
  const scale = maxSide / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function clampRect(
  rect: PixelRect,
  source: { width: number; height: number }
): PixelRect {
  const originX = Math.max(
    0,
    Math.min(Math.round(rect.originX), source.width - 1)
  )
  const originY = Math.max(
    0,
    Math.min(Math.round(rect.originY), source.height - 1)
  )
  return {
    originX,
    originY,
    width: Math.max(
      1,
      Math.min(Math.round(rect.width), source.width - originX)
    ),
    height: Math.max(
      1,
      Math.min(Math.round(rect.height), source.height - originY)
    ),
  }
}

export const exceedsPixelLimit = (width: number, height: number) =>
  width * height > MAX_IMAGE_PIXELS
