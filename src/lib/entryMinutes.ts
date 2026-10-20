/**
 * Converts between the `{ hours, minutes }` pair that Time Entries, Plans and
 * duration wheels store and the single minute total all time math runs on.
 * Dependency-free so pure libs can use it; rendering a duration as text lives
 * in `@/lib/minutes`.
 */

/**
 * Total minutes of an `{ hours, minutes }` pair (a Time Entry, a duration
 * wheel). A missing or `NaN` part counts as 0.
 */
export const entryMinutes = ({
  hours,
  minutes,
}: {
  hours?: number
  minutes?: number
}): number => (hours || 0) * 60 + (minutes || 0)

/**
 * Splits a minute total into the `{ hours, minutes }` pair, the inverse of
 * {@link entryMinutes}. Truncates toward zero so a negative total (a Time
 * Rollover's taken-back entry) round-trips: `-90 → { -1, -30 }`, not floor's `{
 * -2, 30 }`.
 */
export const splitMinutes = (
  total: number
): { hours: number; minutes: number } => ({
  hours: Math.trunc(total / 60),
  minutes: total % 60,
})
