/**
 * Seconds between the Unix epoch (1970-01-01 UTC) and the Core Data reference
 * date (2001-01-01 UTC). MyTime stores every timestamp as fractional seconds
 * since the Core Data reference date; add this offset to get a Unix timestamp.
 */
const CORE_DATA_EPOCH_OFFSET_SECONDS = 978307200

/**
 * Converts a Core Data reference timestamp (fractional seconds since 2001-01-01
 * UTC, as MyTime stores every date) into a JS `Date`.
 */
export const coreDataRefToDate = (zdate: number): Date =>
  new Date((zdate + CORE_DATA_EPOCH_OFFSET_SECONDS) * 1000)

/**
 * Null-tolerant variant for the many MyTime columns that are nullable (a call
 * with no most-recent-visit date, a user with no pioneer start date, etc.).
 * Returns `null` when the timestamp is absent.
 */
export const coreDataRefToDateOrNull = (
  zdate: number | null | undefined
): Date | null =>
  zdate === null || zdate === undefined ? null : coreDataRefToDate(zdate)
