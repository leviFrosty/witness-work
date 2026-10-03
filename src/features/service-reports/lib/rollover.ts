import moment from 'moment'
import { Publisher } from '@/types/publisher'
import {
  TimeEntry,
  TimeEntriesByYear,
  TimeEntryTombstone,
} from '@/types/timeEntry'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
} from '@/lib/serviceReport'
import { getServiceYearFromDate } from '@/lib/serviceYear'
import { syncTimestamp } from '@/lib/syncClock'

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
 * after Undo must then be stamped newer than its tombstones (see
 * `restampOverTombstones`).
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

/**
 * Re-stamps just-added entries (`ids`) whose ids an undone rollover already
 * used, so each is strictly newer than its tombstone. `addServiceReport` stamps
 * the current time, which loses to the tombstone in the iCloud merge when that
 * tombstone came from a device whose clock runs ahead, and the re-applied pair
 * would silently disappear. Returns `changed: false` when nothing needed it.
 */
export const restampOverTombstones = ({
  serviceReports,
  ids,
  tombstones,
}: {
  serviceReports: TimeEntriesByYear
  ids: string[]
  tombstones: TimeEntryTombstone[]
}): { changed: boolean; serviceReports: TimeEntriesByYear } => {
  const targets = new Set(ids)
  const deletedAt = new Map<string, number>()
  for (const tombstone of tombstones) {
    if (!targets.has(tombstone.id)) continue
    deletedAt.set(
      tombstone.id,
      Math.max(deletedAt.get(tombstone.id) ?? 0, tombstone.deletedAt)
    )
  }
  if (deletedAt.size === 0) return { changed: false, serviceReports }

  let changed = false
  const next: TimeEntriesByYear = {}
  for (const [year, months] of Object.entries(serviceReports)) {
    next[year] = {}
    for (const [month, entries] of Object.entries(months)) {
      next[year][month] = entries.map((entry) => {
        const tombstoneAt = deletedAt.get(entry.id)
        if (tombstoneAt === undefined || (entry.updatedAt ?? 0) > tombstoneAt)
          return entry
        changed = true
        return { ...entry, updatedAt: syncTimestamp(tombstoneAt) }
      })
    }
  }
  return changed
    ? { changed, serviceReports: next }
    : { changed, serviceReports }
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
}: {
  serviceReports: TimeEntriesByYear
  today: moment.Moment
  hasAnnualGoal: boolean
  lastRolloverYearMonth: string | null
  publisher?: Publisher
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
