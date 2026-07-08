import moment from 'moment'
import { Publisher } from '@/types/publisher'
import { TimeEntry, TimeEntriesByYear } from '@/types/timeEntry'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
} from '@/lib/serviceReport'
import { getServiceYearFromDate } from '@/lib/serviceYear'

export type PendingRollover = {
  sourceYear: number
  sourceMonth: number
  minutes: number
}

type RolloverSourceOptions = {
  serviceReports: TimeEntriesByYear
  today: moment.Moment
  hasAnnualGoal: boolean
  publisher?: Publisher
  creditLimitOverride?: { enabled: boolean; customLimitHours: number }
}

/**
 * Resolves the single candidate source month (the immediate previous month) and
 * its adjusted-minutes breakdown, or null when no month is eligible. Shared by
 * `computePendingRollovers` and `computeExcludedCreditMinutes` so the
 * prev-month and service-year guards can never drift apart.
 */
const resolveSourceMonth = ({
  serviceReports,
  today,
  hasAnnualGoal,
  publisher,
  creditLimitOverride,
}: RolloverSourceOptions) => {
  // Only ever consider the immediate previous month. Walking further back
  // would re-surface months the user has already settled (whether by
  // accepting/dismissing the rollover when it was first offered or by
  // skipping that month entirely).
  const prev = today.clone().subtract(1, 'month').startOf('month')

  // Service-year guard — applies only to annual-goal publishers (regular
  // pioneer / circuit overseer / custom-with-annual). Their cycle resets
  // Sep→Aug so we never bleed Aug fractional into Sep. Publishers without an
  // annual goal (publisher / regular auxiliary / special pioneer) track
  // monthly and roll across that boundary normally.
  if (
    hasAnnualGoal &&
    getServiceYearFromDate(prev) !== getServiceYearFromDate(today)
  ) {
    return null
  }

  const month = prev.month()
  const year = prev.year()
  const monthReports = getMonthsReports(serviceReports, month, year)
  const adjusted = adjustedMinutesForSpecificMonth(
    monthReports,
    month,
    year,
    publisher,
    creditLimitOverride
  )
  return { month, year, adjusted }
}

export const computePendingRollovers = ({
  lastRolloverYearMonth,
  includeCredit = false,
  ignoreMarker = false,
  ...source
}: RolloverSourceOptions & {
  lastRolloverYearMonth: string | null
  /**
   * When true, fractional credit minutes count toward the rollover amount
   * (legacy behavior, opt-in via preferences). Default is standard-time only —
   * credit is not eligible for rollover.
   */
  includeCredit?: boolean
  /**
   * When true, the per-month marker is ignored. Used by inline UI that wants to
   * show a "rollover available" affordance even after the user has dismissed
   * the takeover or deleted the rollover pair, since both leave the source
   * month fractional.
   */
  ignoreMarker?: boolean
}): PendingRollover[] => {
  if (!ignoreMarker) {
    const currentKey = source.today.format('YYYY-MM')
    if (lastRolloverYearMonth === currentKey) return []
  }

  const resolved = resolveSourceMonth(source)
  if (!resolved) return []

  const { month, year, adjusted } = resolved
  const fractional = (includeCredit ? adjusted.value : adjusted.standard) % 60
  if (fractional === 0) return []

  return [{ sourceYear: year, sourceMonth: month, minutes: fractional }]
}

/**
 * Fractional credit minutes in the source month that are NOT eligible to roll
 * over (0 when `includeCredit` is on). Only credit that actually made it into
 * the month's adjusted value counts — credit squeezed out by the cap never
 * contributed a partial hour in the first place. Drives the "your partial hour
 * is credit time" notice.
 */
export const computeExcludedCreditMinutes = ({
  includeCredit = false,
  ...source
}: RolloverSourceOptions & { includeCredit?: boolean }): number => {
  if (includeCredit) return 0
  const resolved = resolveSourceMonth(source)
  if (!resolved) return 0
  return resolved.adjusted.credit % 60
}

export const buildRolloverEntries = ({
  pending,
  today,
  genId,
}: {
  pending: PendingRollover[]
  today: moment.Moment
  genId: () => string
}): TimeEntry[] => {
  if (pending.length === 0) return []

  // Shared id stamps every entry from this call so the pair (or set) can be
  // deleted atomically — preserving the invariant that source negatives and
  // destination positive sum to zero.
  const groupId = genId()

  const entries: TimeEntry[] = pending.map(
    ({ sourceYear, sourceMonth, minutes }) => {
      const lastDay = moment({ year: sourceYear, month: sourceMonth })
        .endOf('month')
        .date()
      return {
        id: genId(),
        hours: 0,
        minutes: -minutes,
        date: normalizeDateForStorage(
          new Date(sourceYear, sourceMonth, lastDay)
        ),
        rollover: true,
        rolloverGroupId: groupId,
      }
    }
  )

  const totalMinutes = pending.reduce((sum, p) => sum + p.minutes, 0)
  entries.push({
    id: genId(),
    hours: 0,
    minutes: totalMinutes,
    date: normalizeDateForStorage(new Date(today.year(), today.month(), 1)),
    rollover: true,
    rolloverGroupId: groupId,
  })

  return entries
}

export type RolloverApplication = {
  entries: TimeEntry[]
  markerKey: string
}

export const applyRollover = ({
  serviceReports,
  today,
  hasAnnualGoal,
  lastRolloverYearMonth,
  publisher,
  creditLimitOverride,
  includeCredit,
  genId,
}: {
  serviceReports: TimeEntriesByYear
  today: moment.Moment
  hasAnnualGoal: boolean
  lastRolloverYearMonth: string | null
  publisher?: Publisher
  creditLimitOverride?: { enabled: boolean; customLimitHours: number }
  includeCredit?: boolean
  genId: () => string
}): RolloverApplication | null => {
  // Always bypass the marker here. The marker is only meant to gate the
  // boot-time prompt/auto path; once the caller has invoked `applyRollover`
  // explicitly (boot path, inline card, or dev tool) the user's intent is
  // unambiguous and we should roll whatever is genuinely fractional.
  const pending = computePendingRollovers({
    serviceReports,
    today,
    hasAnnualGoal,
    lastRolloverYearMonth,
    publisher,
    creditLimitOverride,
    includeCredit,
    ignoreMarker: true,
  })
  if (pending.length === 0) return null

  return {
    entries: buildRolloverEntries({ pending, today, genId }),
    markerKey: today.format('YYYY-MM'),
  }
}
