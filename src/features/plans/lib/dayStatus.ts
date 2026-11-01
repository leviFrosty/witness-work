export type DayStatus =
  | 'none'
  | 'planned'
  | 'met'
  | 'partial'
  | 'missed'
  | 'logged'

export type DayStatusInput = {
  hasPlan: boolean

  plannedMinutes: number

  hasEntries: boolean
  loggedMinutes: number

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
