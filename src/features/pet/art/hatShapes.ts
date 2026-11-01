export const HAT_W = 24

export const HAT_H = 20

export const HAT_CX = HAT_W / 2

export const HAT_BRIM_ROW = 17

export const HAT_SHORT_H = 14

export const HAT_LIFT = HAT_H - HAT_SHORT_H

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

export const rect = (x0: number, y0: number, x1: number, y1: number) =>
  [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ] as [number, number][]
