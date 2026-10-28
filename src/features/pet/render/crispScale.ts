/**
 * A scale (points per logical pixel) near `targetPt / logicalPx` that puts a
 * whole number of device pixels in every logical pixel, so nearest sampling
 * keeps every pixel the same size. At least one device pixel.
 */
export function crispScale(
  targetPt: number,
  logicalPx: number,
  pixelRatio: number
): number {
  const devicePx = Math.max(1, Math.round((targetPt * pixelRatio) / logicalPx))
  return devicePx / pixelRatio
}

/**
 * The whole pixels in `points` at `scale`. A box sized to N pixels can measure
 * a hair under N × `scale` (7/3 points a pixel at 3x), which mustn't lose one.
 */
export const pixelsIn = (points: number, scale: number): number =>
  Math.floor(points / scale + 0.001)
