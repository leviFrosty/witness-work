/** A calendar month using JavaScript's zero-based month index (0 = January). */
export type CalendarMonth = Readonly<{
  year: number
  month: number
}>

/**
 * Per-calendar-month Monthly Goal overrides, keyed as `YYYY-MM`.
 *
 * The record is intentionally a single Preferences value: iCloud's per-key
 * last-writer-wins merge treats the set of overrides as one piece of user
 * intent, just like report comment overrides and achievement state.
 */
export type MonthlyGoalOverrides = Record<string, number>

export const isValidMonthlyGoalHours = (hours: unknown): hours is number =>
  typeof hours === 'number' && Number.isFinite(hours) && hours >= 0

const MONTHLY_GOAL_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

/** Filters imported/persisted override maps down to canonical keys and goals. */
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
    // Persisted Date values are ISO strings. Reading the written year/month
    // avoids shifting a month when the payload crosses time zones.
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

/**
 * Converts the unused legacy `{ month: Date, hours }[]` preference shape to the
 * canonical override map. When the same month appears more than once, the last
 * valid entry wins, matching the user's most recent array entry.
 */
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

/** Returns the stable `YYYY-MM` key for an exact calendar month. */
export const monthlyGoalKey = ({ year, month }: CalendarMonth): string => {
  if (!Number.isInteger(year) || year < 0 || year > 9999) {
    throw new RangeError('Monthly Goal year must be an integer from 0 to 9999')
  }
  if (!Number.isInteger(month) || month < 0 || month > 11) {
    throw new RangeError('Monthly Goal month must be an integer from 0 to 11')
  }

  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}`
}

/**
 * Pure Monthly Goal resolver for widgets and other non-React consumers. Invalid
 * persisted values are ignored defensively so corrupt/imported state cannot
 * turn progress math into `NaN` or a negative target.
 */
export const resolveMonthlyGoalHours = (
  baseMonthlyGoalHours: number,
  overrides: MonthlyGoalOverrides | undefined,
  target: CalendarMonth
): number => {
  const override = overrides?.[monthlyGoalKey(target)]
  return isValidMonthlyGoalHours(override) ? override : baseMonthlyGoalHours
}
