import moment from 'moment'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
} from './serviceReport'
import { ServiceReportsByYears } from '../types/serviceReport'
import { Publisher } from '../types/publisher'

export type AchievementTier = 'reached' | 'exceeded' | 'crushed' | 'record'

/**
 * Resolves the celebration tier for a given percent-of-goal. Returns null when
 * the user hasn't met their goal — callers render the normal progress state in
 * that case.
 *
 * Thresholds:
 *
 * - Reached: 100-109%
 * - Exceeded: 110-149%
 * - Crushed: 150-199%
 * - Record: 200%+ (also promoted from any tier when the month is a personal best
 *   over the trailing 12 months — see `resolveTier` below)
 */
export const tierFromPercent = (
  percentOfGoal: number
): AchievementTier | null => {
  if (percentOfGoal < 100) return null
  if (percentOfGoal < 110) return 'reached'
  if (percentOfGoal < 150) return 'exceeded'
  if (percentOfGoal < 200) return 'crushed'
  return 'record'
}

/**
 * Returns true when `hoursCompleted` strictly exceeds every one of the prior 12
 * months' adjusted hours. "12 months" is a rolling window (not service-year
 * bound) — so a user's best month in the last year earns the record tier even
 * if they've had higher months earlier in their tracking history.
 *
 * Months with no reports (and therefore zero hours) count — they can't beat the
 * current month, so they don't block the record. A user with fewer than 12
 * months of history still qualifies; they just need to beat whatever prior
 * months exist in the window.
 */
export const isPersonalBest12mo = (
  serviceReports: ServiceReportsByYears,
  currentMonth: number,
  currentYear: number,
  hoursCompleted: number,
  publisher: Publisher,
  creditLimit: { enabled: boolean; customLimitHours: number }
): boolean => {
  if (hoursCompleted <= 0) return false

  const currentDate = moment().month(currentMonth).year(currentYear)
  for (let i = 1; i <= 12; i++) {
    const prior = currentDate.clone().subtract(i, 'months')
    const priorMonth = prior.month()
    const priorYear = prior.year()
    const reports = getMonthsReports(serviceReports, priorMonth, priorYear)
    if (reports.length === 0) continue
    const priorHours =
      adjustedMinutesForSpecificMonth(
        reports,
        priorMonth,
        priorYear,
        publisher,
        creditLimit
      ).value / 60
    if (priorHours >= hoursCompleted) return false
  }
  return true
}

/**
 * Resolves the final tier a month should display, combining raw percent-of-goal
 * with the personal-best promotion.
 */
export const resolveTier = (
  percentOfGoal: number,
  isPersonalBest: boolean
): AchievementTier | null => {
  const base = tierFromPercent(percentOfGoal)
  if (!base) return null
  if (isPersonalBest && base !== 'record') return 'record'
  return base
}

/** Stable key used by the `celebratedTiers` preference map. */
export const monthCelebrationKey = (month: number, year: number): string =>
  `${year}-${String(month + 1).padStart(2, '0')}`
