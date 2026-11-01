import apis from '@/constants/apis'

let offsetMs = 0
let calibratedOffset = false
let anchor: { time: number; elapsed: number; wall: number } | undefined
const uncalibratedStamps = new Set<number>()
const correctedStamps = new Map<number, number>()
let calibratedAt = 0
let calibration: Promise<number | null> | undefined

let failures = 0
let failedAt = 0

const FAILURE_BACKOFF_MS = 60_000
const MAX_FAILURE_BACKOFF_MS = 60 * 60_000

export const calibrationBackoffMs = (failed: number): number =>
  failed === 0
    ? 0
    : Math.min(FAILURE_BACKOFF_MS * 2 ** (failed - 1), MAX_FAILURE_BACKOFF_MS)

const elapsedNow = () => globalThis.performance?.now() ?? Date.now()

export function syncNow(): number {
  if (!anchor) return Date.now() + offsetMs

  const elapsed = elapsedNow() - anchor.elapsed
  const wall = Date.now() - anchor.wall
  return anchor.time + Math.max(elapsed, wall)
}

export const hasCalibratedSyncClock = () => calibratedOffset

export function setSyncClockOffset(value: number, calibrated = false): void {
  offsetMs = Number.isFinite(value) ? value : 0
  calibratedOffset = calibrated && Number.isFinite(value)
  anchor = undefined
  calibratedAt = 0
  failures = 0
  failedAt = 0
}

export function syncTimestamp(previous = 0): number {
  const timestamp = Math.max(
    Math.floor(syncNow()),
    correctedSyncTimestamp(previous) + 1
  )
  if (!anchor) {
    uncalibratedStamps.add(timestamp)
    if (uncalibratedStamps.size > 10_000)
      uncalibratedStamps.delete(uncalibratedStamps.values().next().value!)
  }
  return timestamp
}

export const correctedSyncTimestamp = (value: number) =>
  correctedStamps.get(value) ?? value

export function refreshSyncClock({ force = false } = {}): Promise<
  number | null
> {
  if (calibration) return calibration
  if (!force && calibratedAt && elapsedNow() - calibratedAt < 60 * 60_000)
    return Promise.resolve(null)
  if (
    !force &&
    failures &&
    elapsedNow() - failedAt < calibrationBackoffMs(failures)
  )
    return Promise.resolve(null)
  calibration = (async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const started = elapsedNow()
    try {
      const response = await fetch(apis.apiHealth, {
        signal: controller.signal,
        cache: 'no-store',
      })
      const serverTime = Date.parse(response.headers.get('date') ?? '')
      if (!response.ok || !Number.isFinite(serverTime)) {
        failures++
        failedAt = elapsedNow()
        return null
      }
      const time = serverTime + (elapsedNow() - started) / 2
      const previousOffset = offsetMs
      offsetMs = time - Date.now()
      if (Math.abs(offsetMs - previousOffset) > 5 * 60_000) {
        for (const timestamp of uncalibratedStamps)
          correctedStamps.set(
            timestamp,
            Math.max(1, timestamp + offsetMs - previousOffset)
          )
      }
      uncalibratedStamps.clear()
      calibratedOffset = true
      anchor = { time, elapsed: elapsedNow(), wall: Date.now() }
      calibratedAt = elapsedNow()
      failures = 0
      return offsetMs
    } catch {
      failures++
      failedAt = elapsedNow()
      return null
    } finally {
      clearTimeout(timeout)
    }
  })().finally(() => {
    calibration = undefined
  })
  return calibration
}
