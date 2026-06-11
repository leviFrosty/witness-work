/**
 * User-adjustable day thresholds that drive the contact staleness buckets. A
 * contact stays `recent` while its most recent conversation is within
 * `weekDays` days, becomes `week` until `monthDays` days, and `month` (stale)
 * after that. Defaults and clamping live in `@/constants/staleness`.
 */
export type StalenessBreakpoints = {
  weekDays: number
  monthDays: number
}
