export type CalendarMonth = Readonly<{
  year: number
  month: number
}>

export type MonthlyGoalOverrides = Record<string, number>

export const isValidMonthlyGoalHours = (hours: unknown): hours is number =>
  typeof hours === 'number' && Number.isFinite(hours) && hours >= 0

const MONTHLY_GOAL_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

export const normalizeMonthlyGoalOverrides = (
  value: unknown
): MonthlyGoalOverrides => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const normalized: MonthlyGoalOverrides = {}
  for (const [key, hours] of Object.entries(value)) {
    if (MONTHLY_GOAL_KEY_PATTERN.test(key) && isValidMonthlyGoalHours(hours)) {
      normalized[key] = hours
    }
  }
  return normalized
}

const legacyMonthToKey = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const match = /^(\d{4})-(0[1-9]|1[0-2])/.exec(value)
    return match ? `${match[1]}-${match[2]}` : null
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return monthlyGoalKey({
      year: value.getFullYear(),
      month: value.getMonth(),
    })
  }

  return null
}

export const monthlyGoalOverridesFromLegacy = (
  value: unknown
): MonthlyGoalOverrides => {
  if (!Array.isArray(value)) return {}

  const overrides: MonthlyGoalOverrides = {}
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const { month, hours } = item as { month?: unknown; hours?: unknown }
    const key = legacyMonthToKey(month)
    if (key && isValidMonthlyGoalHours(hours)) overrides[key] = hours
  }
  return overrides
}

export const monthlyGoalKey = ({ year, month }: CalendarMonth): string => {
  if (!Number.isInteger(year) || year < 0 || year > 9999) {
    throw new RangeError('Monthly Goal year must be an integer from 0 to 9999')
  }
  if (!Number.isInteger(month) || month < 0 || month > 11) {
    throw new RangeError('Monthly Goal month must be an integer from 0 to 11')
  }

  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}`
}

export const resolveMonthlyGoalHours = (
  baseMonthlyGoalHours: number,
  overrides: MonthlyGoalOverrides | undefined,
  target: CalendarMonth
): number => {
  const override = overrides?.[monthlyGoalKey(target)]
  return isValidMonthlyGoalHours(override) ? override : baseMonthlyGoalHours
}
