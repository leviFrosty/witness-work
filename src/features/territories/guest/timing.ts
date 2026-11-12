export const POLL_ACTIVE_MS = 15_000

export const POLL_IDLE_MS = 60_000

export const IDLE_AFTER_MS = 10 * 60_000

export const CLOCK_TOLERANCE_MS = 1_500

export function pollDelay({
  visible,
  idleMs,
}: {
  visible: boolean
  idleMs: number
}): number | null {
  if (!visible) return null
  return idleMs >= IDLE_AFTER_MS ? POLL_IDLE_MS : POLL_ACTIVE_MS
}

export function clockOffset(
  serverTime: number | null,
  localTime: number,
  previous: number
): number {
  if (serverTime === null) return previous
  const offset = serverTime - localTime
  return Math.abs(offset) > CLOCK_TOLERANCE_MS ? Math.round(offset) : 0
}

export const nextStamp = (corrected: number, ...previous: number[]) =>
  Math.max(Math.round(corrected), ...previous.map((stamp) => stamp + 1))
