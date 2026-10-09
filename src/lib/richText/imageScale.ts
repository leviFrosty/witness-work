/*
 * A note photo's size as a share of the note's width, so a photo resized to
 * half the note on a phone takes half the note on an iPad too. Shared by the
 * editor (in its WebView) and the native app, so it imports nothing.
 */

/** The smallest a photo can be made: a quarter of the note's width. */
export const MIN_IMAGE_SCALE = 0.25
/** A drag this close to a quarter, half, three quarters or full snaps to it. */
const SNAP_DISTANCE = 0.04
const SNAP_SCALES = [0.25, 0.5, 0.75, 1]

/** A stored scale, clamped and rounded so it saves the same everywhere. */
export function normalizeImageScale(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined
  }
  const clamped = Math.min(1, Math.max(MIN_IMAGE_SCALE, value))
  return Math.round(clamped * 100) / 100
}

/** The scale a resize drag lands on. */
export function snapImageScale(value: number): number {
  const clamped = Math.min(1, Math.max(MIN_IMAGE_SCALE, value))
  const near = SNAP_SCALES.find(
    (scale) => Math.abs(scale - clamped) < SNAP_DISTANCE
  )
  return normalizeImageScale(near ?? clamped) ?? 1
}
