import { syncNow, correctedSyncTimestamp } from '@/lib/syncClock'

export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60_000

/** Adjust sync stamps only, never appointment, service, or creation dates. */
export function translateSyncTimestamps<T>(
  value: T,
  offset = 0,
  ceiling = syncNow() + CLOCK_SKEW_TOLERANCE_MS
): T {
  const stamp = (value: number) =>
    value <= 1
      ? value
      : Math.max(1, Math.min(correctedSyncTimestamp(value) + offset, ceiling))
  const adjust = (item: unknown, key = ''): unknown => {
    if (
      typeof item === 'number' &&
      [
        'updatedAt',
        'deletedAt',
        'writtenAt',
        'readdedAt',
        'detailsRetainUntil',
      ].includes(key)
    ) {
      return key === 'detailsRetainUntil' ? item + offset : stamp(item)
    }
    if (Array.isArray(item)) return item.map((entry) => adjust(entry))
    if (item && typeof item === 'object' && !(item instanceof Date)) {
      return Object.fromEntries(
        Object.entries(item).map(([name, entry]) => {
          if (
            ['updatedAt', 'preferenceUpdatedAt', 'profileUpdatedAt'].includes(
              name
            ) &&
            entry &&
            typeof entry === 'object'
          ) {
            return [
              name,
              Object.fromEntries(
                Object.entries(entry).map(([k, ts]) => [k, stamp(ts as number)])
              ),
            ]
          }
          return [name, adjust(entry, name)]
        })
      )
    }
    return item
  }
  return adjust(value) as T
}

/** Legacy writers used wall time; container dates anchor their relative stamps. */
export function alignPayloadClock<
  T extends { writtenAt: number; calibratedClock?: boolean },
>(payload: T, modifiedAt: number): T {
  const anchor = Math.min(modifiedAt, syncNow())
  const delta = anchor - payload.writtenAt
  const offset =
    !payload.calibratedClock &&
    Number.isFinite(anchor) &&
    Math.abs(delta) > CLOCK_SKEW_TOLERANCE_MS
      ? delta
      : 0
  return translateSyncTimestamps(payload, offset)
}
