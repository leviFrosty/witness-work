import moment from 'moment'
import { Publisher } from '@/types/publisher'
import { TimeEntry, TimeEntriesByYear } from '@/types/timeEntry'
import {
  AdjustedMinutes,
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
  monthCreditCapMinutes,
} from '@/lib/serviceReport'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import type { PublisherCapabilities } from '@/lib/publisherCapabilities'
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

const resolveSourceMonth = ({
  serviceReports,
  today,
  hasAnnualGoal,
  publisher,
  creditLimitOverride,
}: RolloverSourceOptions) => {
  const prev = today.clone().subtract(1, 'month').startOf('month')

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

const rolloverMinutes = (
  adjusted: AdjustedMinutes,
  includeCredit: boolean
): number =>
  includeCredit
    ? adjusted.value % 60
    : Math.min(adjusted.standard % 60, adjusted.value % 60)

const destinationRoom = (
  minutes: number,
  adjusted: AdjustedMinutes,
  capMinutes: number | null
): number => {
  const credit = adjusted.credit + adjusted.creditOverage
  if (capMinutes === null || credit === 0 || adjusted.standard >= capMinutes)
    return minutes
  return Math.min(minutes, Math.max(0, capMinutes - adjusted.standard - credit))
}

export const rolloverRole = ({
  source,
  destination,
}: {
  source: Pick<PublisherCapabilities, 'type' | 'hasAnnualGoal'>
  destination: Pick<PublisherCapabilities, 'type' | 'hasAnnualGoal'>
}): {
  publisher: Publisher
  destinationPublisher: Publisher
  hasAnnualGoal: boolean
} => ({
  publisher: source.type,
  destinationPublisher: destination.type,
  hasAnnualGoal: source.hasAnnualGoal || destination.hasAnnualGoal,
})

export const rolloverSourceMonth = (today: moment.Moment): CalendarMonth => {
  const prev = today.clone().subtract(1, 'month')
  return { year: prev.year(), month: prev.month() }
}

export const computePendingRollovers = ({
  lastRolloverYearMonth,
  includeCredit = false,
  ignoreMarker = false,
  destinationPublisher,
  ...source
}: RolloverSourceOptions & {
  lastRolloverYearMonth: string | null

  destinationPublisher?: Publisher

  includeCredit?: boolean

  ignoreMarker?: boolean
}): PendingRollover[] => {
  if (!ignoreMarker) {
    const currentKey = source.today.format('YYYY-MM')
    if (lastRolloverYearMonth === currentKey) return []
  }

  const resolved = resolveSourceMonth(source)
  if (!resolved) return []

  const { today, serviceReports, creditLimitOverride } = source
  const destination = destinationPublisher ?? source.publisher
  const minutes = destinationRoom(
    rolloverMinutes(resolved.adjusted, includeCredit),
    adjustedMinutesForSpecificMonth(
      getMonthsReports(serviceReports, today.month(), today.year()),
      today.month(),
      today.year(),
      destination,
      creditLimitOverride
    ),
    monthCreditCapMinutes(destination, creditLimitOverride)
  )
  if (minutes === 0) return []

  const { month, year } = resolved

  return [{ sourceYear: year, sourceMonth: month, minutes }]
}

export const computeExcludedCreditMinutes = ({
  includeCredit = false,
  ...source
}: RolloverSourceOptions & { includeCredit?: boolean }): number => {
  if (includeCredit) return 0
  const resolved = resolveSourceMonth(source)
  if (!resolved) return 0
  const { adjusted } = resolved
  return Math.max(0, (adjusted.value % 60) - rolloverMinutes(adjusted, false))
}

const monthKey = (year: number, month: number): string =>
  `${year}-${String(month + 1).padStart(2, '0')}`

export type RolloverIds = {
  groupId: string

  sourceIds: string[]
  destinationId: string
}

export const rolloverIds = ({
  pending,
  today,
  serviceReports,
}: {
  pending: PendingRollover[]
  today: moment.Moment
  serviceReports: TimeEntriesByYear
}): RolloverIds => {
  const sources = pending.map((p) => monthKey(p.sourceYear, p.sourceMonth))
  const base = `rollover-${sources.join('_')}-to-${monthKey(
    today.year(),
    today.month()
  )}`
  const idsFor = (groupId: string): RolloverIds => ({
    groupId,
    sourceIds: sources.map((source) =>
      sources.length === 1 ? `${groupId}-src` : `${groupId}-src-${source}`
    ),
    destinationId: `${groupId}-dst`,
  })

  const inUse = new Set<string>()
  for (const months of Object.values(serviceReports)) {
    for (const entries of Object.values(months)) {
      for (const entry of entries) {
        inUse.add(entry.id)
        if (entry.rolloverGroupId) inUse.add(entry.rolloverGroupId)
      }
    }
  }
  const isTaken = ({ groupId, sourceIds, destinationId }: RolloverIds) =>
    [groupId, ...sourceIds, destinationId].some((id) => inUse.has(id))

  let ids = idsFor(base)
  for (let ordinal = 2; isTaken(ids); ordinal++) {
    ids = idsFor(`${base}-${ordinal}`)
  }
  return ids
}

export const buildRolloverEntries = ({
  pending,
  today,
  serviceReports,
}: {
  pending: PendingRollover[]
  today: moment.Moment

  serviceReports: TimeEntriesByYear
}): TimeEntry[] => {
  if (pending.length === 0) return []

  const { groupId, sourceIds, destinationId } = rolloverIds({
    pending,
    today,
    serviceReports,
  })

  const entries: TimeEntry[] = pending.map(
    ({ sourceYear, sourceMonth, minutes }, index) => {
      const lastDay = moment({ year: sourceYear, month: sourceMonth })
        .endOf('month')
        .date()
      return {
        id: sourceIds[index],
        hours: 0,
        minutes: -minutes,
        date: new Date(sourceYear, sourceMonth, lastDay, 12),
        rollover: true,
        rolloverGroupId: groupId,
      }
    }
  )

  const totalMinutes = pending.reduce((sum, p) => sum + p.minutes, 0)
  entries.push({
    id: destinationId,
    hours: 0,
    minutes: totalMinutes,
    date: new Date(today.year(), today.month(), 1, 12),
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
  destinationPublisher,
  creditLimitOverride,
  includeCredit,
}: {
  serviceReports: TimeEntriesByYear
  today: moment.Moment
  hasAnnualGoal: boolean
  lastRolloverYearMonth: string | null
  publisher?: Publisher
  destinationPublisher?: Publisher
  creditLimitOverride?: { enabled: boolean; customLimitHours: number }
  includeCredit?: boolean
}): RolloverApplication | null => {
  const pending = computePendingRollovers({
    serviceReports,
    today,
    hasAnnualGoal,
    lastRolloverYearMonth,
    publisher,
    destinationPublisher,
    creditLimitOverride,
    includeCredit,
    ignoreMarker: true,
  })
  if (pending.length === 0) return null

  return {
    entries: buildRolloverEntries({ pending, today, serviceReports }),
    markerKey: today.format('YYYY-MM'),
  }
}
