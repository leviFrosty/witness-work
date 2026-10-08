/**
 * How a calendar day reads at a glance, matching the month calendar's squares:
 * a Plan that time met, partly met, or missed; a Plan still ahead; time logged
 * without a Plan; or nothing.
 */
export type DayStatus =
  | 'none'
  | 'planned'
  | 'met'
  | 'partial'
  | 'missed'
  | 'logged'

export type DayStatusInput = {
  /** A Day Plan or recurring Plan covers the day. */
  hasPlan: boolean
  /** Day Plans add up; otherwise the day's longest recurring Plan. */
  plannedMinutes: number
  /** Any Time Entry exists for the day, including a 0h "shared" marker. */
  hasEntries: boolean
  loggedMinutes: number
  /** The day is before today. Today still reads as planned until logged. */
  isPast: boolean
}

export function dayStatus({
  hasPlan,
  plannedMinutes,
  hasEntries,
  loggedMinutes,
  isPast,
}: DayStatusInput): DayStatus {
  if (!hasPlan) return hasEntries ? 'logged' : 'none'
  if (!hasEntries) return isPast ? 'missed' : 'planned'
  return loggedMinutes >= plannedMinutes ? 'met' : 'partial'
}
