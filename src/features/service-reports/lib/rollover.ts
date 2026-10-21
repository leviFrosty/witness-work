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

/**
 * Minutes that can move out of a month without changing its adjusted value by
 * anything other than those minutes. The cap is whole hours, so a month the cap
 * holds at its limit is already whole; rolling standard time out of it would
 * only let squeezed-out credit refill the gap, and the Service Year would gain
 * minutes nobody logged. Without credit, that's the standard fraction, or less
 * when credit already completes the hour.
 */
const rolloverMinutes = (
  adjusted: AdjustedMinutes,
  includeCredit: boolean
): number =>
  includeCredit
    ? adjusted.value % 60
    : Math.min(adjusted.standard % 60, adjusted.value % 60)

/**
 * How many of `minutes` the destination month would count in full. Added
 * standard time pushes counted credit out once standard plus credit reaches the
 * cap, so a month the cap already holds with credit can't take the rollover
 * without the Service Year losing those minutes.
 */
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

/**
 * The role inputs for rolling `today`'s previous month forward. Each month is
 * capped by its own role: the source's numbers are the ones being floored, and
 * the destination's cap limits what it can take. The Service Year guard holds
 * when either side has an annual goal, so neither year's annual total takes
 * minutes logged in the other.
 */
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

/** The calendar month a rollover on `today` floors. */
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
  /** This month's role, whose cap limits what it can take. Default: `publisher`. */
  destinationPublisher?: Publisher
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
  const { adjusted } = resolved
  return Math.max(0, (adjusted.value % 60) - rolloverMinutes(adjusted, false))
}

/** `YYYY-MM` for a 0-indexed month. */
const monthKey = (year: number, month: number): string =>
  `${year}-${String(month + 1).padStart(2, '0')}`

export type RolloverIds = {
  /** Shared by every entry of the rollover, as `rolloverGroupId`. */
  groupId: string
  /** One per `pending` source month, in the same order. */
  sourceIds: string[]
  destinationId: string
}

/**
 * Ids for rolling `pending` into `today`'s month, derived from the months
 * alone: `rollover-2026-09-to-2026-10` for the group, plus `-src` and `-dst`
 * for its entries. Two devices that compute the same rollover from the same
 * data therefore write the same records, and iCloud's last-writer-wins merge
 * keeps one pair. Random ids would leave two pairs that floor the source month
 * twice.
 *
 * An ordinal (`-2`, `-3`, …) is added only while a live entry already uses one
 * of the ids, as when the same month is rolled over again after backdated
 * entries. `addServiceReport` doesn't dedupe ids, so reusing a live id would
 * store two entries under it. A deleted pair's ids are free again; re-applying
 * after Undo stamps them past their tombstones (`addServiceReports`).
 */
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

  // Entry ids and group ids of live entries. A shared group id would make
  // deleting one pair delete the other with it.
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
  /** The live entries, so the new ids can't collide with them. */
  serviceReports: TimeEntriesByYear
}): TimeEntry[] => {
  if (pending.length === 0) return []

  // Shared group id stamps every entry from this call so the pair (or set) can
  // be deleted atomically — preserving the invariant that source negatives
  // and destination positive sum to zero.
  //
  // Dates are local-noon days: `addServiceReport` anchors them itself, and an
  // already-anchored date would be re-anchored onto the next day at UTC+12 and
  // beyond — moving a month-end negative into the destination month.
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
