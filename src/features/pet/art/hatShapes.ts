/**
 * The hat canvas and the shape helpers every hat file draws with. Secret hats
 * (`hatsWorld.ts`, `hatsWhimsy.ts`) draw in the full {@link HAT_W} ×
 * {@link HAT_H} canvas with their lowest brim pixels on {@link HAT_BRIM_ROW},
 * centred on x {@link HAT_CX}.
 */
/** Hat canvas width. */
export const HAT_W = 24
/** Hat canvas height: room above the brim for the tallest secret hats. */
export const HAT_H = 20
/** The hat canvas' centre column (between pixels 11 and 12). */
export const HAT_CX = HAT_W / 2
/** The canvas row of the hat's lowest brim pixels. */
export const HAT_BRIM_ROW = 17
/** The first twelve hats' canvas height, as they were drawn. */
export const HAT_SHORT_H = 14
/** How far the first twelve hats move down into the {@link HAT_H} canvas. */
export const HAT_LIFT = HAT_H - HAT_SHORT_H

/** The top half of an ellipse on `base`, as a polygon. */
export function dome(
  cx: number,
  base: number,
  rx: number,
  ry: number,
  steps = 14
): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI + (i / steps) * Math.PI
    pts.push([cx + rx * Math.cos(a), base + ry * Math.sin(a)])
  }
  return pts
}

/** A rectangle from (x0, y0) to (x1, y1). */
export const rect = (x0: number, y0: number, x1: number, y1: number) =>
  [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ] as [number, number][]
