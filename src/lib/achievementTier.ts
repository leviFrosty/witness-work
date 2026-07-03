import moment from 'moment'
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck'
import { faStar } from '@fortawesome/free-solid-svg-icons/faStar'
import { faTrophy } from '@fortawesome/free-solid-svg-icons/faTrophy'
import { faCrown } from '@fortawesome/free-solid-svg-icons/faCrown'
import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
} from '@/lib/serviceReport'
import { TimeEntriesByYear } from '@/types/timeEntry'
import { Publisher } from '@/types/publisher'
import { Theme } from '@/types/theme'

export type AchievementTier = 'reached' | 'exceeded' | 'crushed' | 'record'

/**
 * Canonical icon for each Achievement Tier. Single source of truth shared by
 * every surface that renders a tier seal (month hero, year-row glance).
 */
export const tierIcon = (tier: AchievementTier): IconDefinition => {
  switch (tier) {
    case 'reached':
      return faCheck
    case 'exceeded':
      return faStar
    case 'crushed':
      return faTrophy
    case 'record':
      return faCrown
  }
}

/**
 * Canonical accent color for each Achievement Tier. Gold (`supporter`) is
 * reserved for the `record` personal-best tier; every other goal-met tier
 * (including `crushed` at 150%+) shares the regular accent palette so all
 * surfaces tell the same color story.
 */
export const tierColor = (tier: AchievementTier, theme: Theme): string =>
  tier === 'record' ? theme.colors.supporter : theme.colors.accent

/**
 * Resolves the threshold-based celebration tier for a given percent-of-goal.
 * Returns null when the user hasn't met their goal — callers render the normal
 * progress state in that case.
 *
 * The `record` tier is intentionally NOT reachable from this function — it's
 * reserved for actual 12-month personal bests. A monster month at 500% of goal
 * still tops out at `crushed` here; only `resolveTier` can promote to
 * `record`.
 *
 * Thresholds:
 *
 * - Reached: 100-109%
 * - Exceeded: 110-149%
 * - Crushed: 150%+
 */
export const tierFromPercent = (
  percentOfGoal: number
): AchievementTier | null => {
  if (percentOfGoal < 100) return null
  if (percentOfGoal < 110) return 'reached'
  if (percentOfGoal < 150) return 'exceeded'
  return 'crushed'
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
  serviceReports: TimeEntriesByYear,
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
 * Resolves the final tier a month should display.
 *
 * `record` requires _both_ that the month met its goal _and_ that it's a
 * 12-month personal best — a high percent of goal alone isn't enough. A 286%
 * month with a higher prior month within the last year is `crushed`, not
 * `record`.
 */
export const resolveTier = (
  percentOfGoal: number,
  isPersonalBest: boolean
): AchievementTier | null => {
  const base = tierFromPercent(percentOfGoal)
  if (!base) return null
  if (isPersonalBest) return 'record'
  return base
}

/** Stable key used by the `celebratedTiers` preference map. */
export const monthCelebrationKey = (month: number, year: number): string =>
  `${year}-${String(month + 1).padStart(2, '0')}`
