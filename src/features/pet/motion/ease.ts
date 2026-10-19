/** Interpolation helpers for motion tables. */

/** Clamps `u` to [0, 1]. */
export function clamp01(u: number): number {
  return Math.max(0, Math.min(1, u))
}

/** Linear from `a` to `b` as `u` goes 0 → 1 (clamped). */
export function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * clamp01(u)
}

/** Cubic ease-out (fast start, gentle stop), clamped. */
export function easeOut(u: number): number {
  return 1 - Math.pow(1 - clamp01(u), 3)
}
