import moment from 'moment'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
} from '@/lib/serviceReport'
import { TimeEntriesByYear } from '@/types/timeEntry'
import { Publisher } from '@/types/publisher'
import { Theme } from '@/types/theme'

export type AchievementTier = 'reached' | 'exceeded' | 'crushed' | 'record'

export const tierColor = (tier: AchievementTier, theme: Theme): string =>
  tier === 'record' ? theme.colors.supporter : theme.colors.accent

export const tierFromPercent = (
  percentOfGoal: number
): AchievementTier | null => {
  if (percentOfGoal < 100) return null
  if (percentOfGoal < 110) return 'reached'
  if (percentOfGoal < 150) return 'exceeded'
  return 'crushed'
}

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

export const resolveTier = (
  percentOfGoal: number,
  isPersonalBest: boolean
): AchievementTier | null => {
  const base = tierFromPercent(percentOfGoal)
  if (!base) return null
  if (isPersonalBest) return 'record'
  return base
}

export const monthCelebrationKey = (month: number, year: number): string =>
  `${year}-${String(month + 1).padStart(2, '0')}`
