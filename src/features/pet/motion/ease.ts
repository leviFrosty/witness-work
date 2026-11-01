export function clamp01(u: number): number {
  return Math.max(0, Math.min(1, u))
}

export function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * clamp01(u)
}

export function easeOut(u: number): number {
  return 1 - Math.pow(1 - clamp01(u), 3)
}
