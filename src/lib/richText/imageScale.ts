export const MIN_IMAGE_SCALE = 0.25

const SNAP_DISTANCE = 0.04
const SNAP_SCALES = [0.25, 0.5, 0.75, 1]

export function normalizeImageScale(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined
  }
  const clamped = Math.min(1, Math.max(MIN_IMAGE_SCALE, value))
  return Math.round(clamped * 100) / 100
}

export function snapImageScale(value: number): number {
  const clamped = Math.min(1, Math.max(MIN_IMAGE_SCALE, value))
  const near = SNAP_SCALES.find(
    (scale) => Math.abs(scale - clamped) < SNAP_DISTANCE
  )
  return normalizeImageScale(near ?? clamped) ?? 1
}
