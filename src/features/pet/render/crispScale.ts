export function crispScale(
  targetPt: number,
  logicalPx: number,
  pixelRatio: number
): number {
  const devicePx = Math.max(1, Math.round((targetPt * pixelRatio) / logicalPx))
  return devicePx / pixelRatio
}

export const pixelsIn = (points: number, scale: number): number =>
  Math.floor(points / scale + 0.001)
