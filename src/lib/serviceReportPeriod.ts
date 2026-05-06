import moment from 'moment'
import {
  AdjustedMinutes,
  adjustedMinutesForSpecificMonth,
  calculateMinutesRemaining,
  getMonthsReports,
} from './serviceReport'
import { computePendingRollovers, PendingRollover } from './rollover'
import { ServiceReportsByYears } from '../types/serviceReport'
import { Publisher } from '../types/publisher'

export type ServiceReportPeriodInput = {
  year: number
  month: number
  serviceReports: ServiceReportsByYears
  publisher?: Publisher
  creditLimitOverride?: { enabled: boolean; customLimitHours: number }
  goalHours?: number
  /**
   * Anchor for rollover-from-prior: a moment treated as "today". When supplied
   * and (year, month) is the same calendar month as the anchor, we surface the
   * prior month's fractional minutes so the period can show "+N from last
   * month". When unset, rolloverFromPrior is null — the period is treated as
   * standalone.
   */
  referenceDate?: moment.Moment
  hasAnnualGoal?: boolean
  lastRolloverYearMonth?: string | null
}

export type ServiceReportPeriodResult = {
  adjustedMinutes: AdjustedMinutes
  goalRemaining: number
  rolloverFromPrior: PendingRollover | null
}

const forMonth = (
  input: ServiceReportPeriodInput
): ServiceReportPeriodResult => {
  const monthsReports = getMonthsReports(
    input.serviceReports,
    input.month,
    input.year
  )
  const adjustedMinutes = adjustedMinutesForSpecificMonth(
    monthsReports,
    input.month,
    input.year,
    input.publisher,
    input.creditLimitOverride
  )
  const goalRemaining = calculateMinutesRemaining({
    minutes: adjustedMinutes.value,
    goalHours: input.goalHours ?? 0,
  })

  const rolloverFromPrior = computeRolloverFromPrior(input)

  return { adjustedMinutes, goalRemaining, rolloverFromPrior }
}

const computeRolloverFromPrior = (
  input: ServiceReportPeriodInput
): PendingRollover | null => {
  if (!input.referenceDate) return null
  const refMonth = input.referenceDate.month()
  const refYear = input.referenceDate.year()
  if (refMonth !== input.month || refYear !== input.year) return null

  const pending = computePendingRollovers({
    serviceReports: input.serviceReports,
    today: input.referenceDate,
    hasAnnualGoal: input.hasAnnualGoal ?? false,
    lastRolloverYearMonth: input.lastRolloverYearMonth ?? null,
    publisher: input.publisher,
    creditLimitOverride: input.creditLimitOverride,
  })

  return pending[0] ?? null
}

export const ServiceReportPeriod = {
  forMonth,
}
