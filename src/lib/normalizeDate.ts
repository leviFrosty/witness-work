import moment from 'moment'
import {
  DayPlan,
  RecurringPlan,
  RecurringPlanOverride,
  TimeEntriesByYear,
} from '@/types/timeEntry'

/**
 * Plans and time entries store a _calendar day_, not a moment in time. We carry
 * it as a JS Date (legacy data shape) anchored at noon UTC. Reads must use UTC
 * components — `moment.utc(d).year()/.month()/.date()` — so the day never
 * drifts when the device timezone changes. See `momentStoredDate` for the
 * read-side helper.
 *
 * `normalizeDateForStorage` captures the user's local Y/M/D at write time and
 * locks it in by anchoring at noon UTC of that triple.
 */
export const normalizeDateForStorage = (date: Date | string): Date => {
  const m = moment(date)
  return new Date(Date.UTC(m.year(), m.month(), m.date(), 12, 0, 0, 0))
}

const isAnchoredNoonUtc = (d: Date): boolean =>
  d.getUTCHours() === 12 &&
  d.getUTCMinutes() === 0 &&
  d.getUTCSeconds() === 0 &&
  d.getUTCMilliseconds() === 0

/**
 * Variant for the migration / iCloud-merge paths, where the input is already a
 * _stored_ Date — either a freshly-anchored noon-UTC value from a post-fix
 * peer, or a pre-fix raw value. Preserves already-anchored values so syncs
 * between devices in different TZs don't drift the calendar day on every pull.
 * Pre-fix values fall through to local extraction (best-effort, locked in to
 * the device's current TZ).
 *
 * Do NOT use this on user-typed input — `normalizeDateForStorage` is the
 * write-path entry point. The shortcut here is unsafe for fresh user input
 * because midnight local in NZST (UTC+12) is _coincidentally_ noon UTC of the
 * prior day, and would be misread as already-anchored.
 */
export const preserveOrNormalizeStoredDate = (date: Date | string): Date => {
  if (date instanceof Date && isAnchoredNoonUtc(date)) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        12,
        0,
        0,
        0
      )
    )
  }
  return normalizeDateForStorage(date)
}

/**
 * Reads a stored calendar-day Date in UTC mode. Use this anywhere you'd
 * otherwise call `moment(d)` on a `TimeEntry.date`, `DayPlan.date`,
 * `RecurringPlan.startDate`, etc. — anything that came through
 * `normalizeDateForStorage`. UTC components are immutable across TZ changes, so
 * the calendar day is stable.
 *
 * A value that never went through the write path — a raw `new Date()` instant,
 * or pre-normalization data the persist migration hasn't re-anchored yet — is
 * read as the _local_ calendar day it falls on: the day
 * `normalizeDateForStorage` would have locked in. Reading such a value's UTC
 * day instead lands it on the wrong day (and, at a month boundary, in the wrong
 * month) every evening west of UTC and every morning east of it. Anchored
 * values are detected the same way `preserveOrNormalizeStoredDate` does and
 * share its caveat; this is a read-side safety net, not a substitute for
 * normalizing on write.
 */
export const momentStoredDate = (date: Date | string): moment.Moment => {
  const instant = date instanceof Date ? date : new Date(date)
  if (isAnchoredNoonUtc(instant)) return moment.utc(instant)
  return moment.utc(normalizeDateForStorage(date))
}

/**
 * Converts a UTC-mode day cursor (e.g. a `moment.utc` walk) into a local-mode
 * noon Date carrying the same calendar day. Use when handing a walk's day to
 * APIs that re-extract the _local_ calendar day via `normalizeDateForStorage`
 * (`getPlansIntersectingDay`, `getEffectiveMinutesForRecurringPlan`) — passing
 * `cursor.toDate()` (an instant) lands on the previous local day in TZs west of
 * UTC and the next one east of UTC+11.
 */
export const localDayFromUtcCursor = (cursor: moment.Moment): Date =>
  new Date(cursor.year(), cursor.month(), cursor.date(), 12)

/** The `YYYY-MM-DD` calendar day carried by a stored noon-UTC anchor. */
export const storedDayKey = (date: Date | string): string =>
  momentStoredDate(date).format('YYYY-MM-DD')

/**
 * True when a stored calendar-day anchor falls on the given local calendar day.
 * `localDay` expresses a day in _local_ mode — a `YYYY-MM-DD` string (e.g.
 * react-native-calendars' `dateString`), a local-mode Date, or a local-mode
 * moment cursor. Never pass another stored anchor as `localDay`; compare
 * `storedDayKey`s instead.
 */
export const isStoredDateOnLocalDay = (
  stored: Date | string,
  localDay: Date | string | moment.Moment
): boolean => storedDayKey(stored) === moment(localDay).format('YYYY-MM-DD')

/**
 * Converts a stored calendar-day anchor into a local-mode Date carrying the
 * same calendar day, for date-picker `value` props and local-mode formatting.
 */
export const storedDateToLocalDate = (date: Date | string): Date =>
  localDayFromUtcCursor(momentStoredDate(date))

/** Normalize every Date field on a RecurringPlan to noon-UTC anchor. */
export const normalizeRecurringPlan = (plan: RecurringPlan): RecurringPlan => ({
  ...plan,
  startDate: normalizeDateForStorage(plan.startDate),
  recurrence: {
    ...plan.recurrence,
    endDate: plan.recurrence.endDate
      ? normalizeDateForStorage(plan.recurrence.endDate)
      : plan.recurrence.endDate,
  },
  deletedDates: plan.deletedDates?.map((d) => normalizeDateForStorage(d)),
  overrides: plan.overrides?.map((o) => ({
    ...o,
    date: normalizeDateForStorage(o.date),
  })),
})

/** Same as `normalizeRecurringPlan` but tolerates missing fields (for updates). */
export const normalizePartialRecurringPlan = (
  plan: Partial<RecurringPlan>
): Partial<RecurringPlan> => {
  const result: Partial<RecurringPlan> = { ...plan }
  if (plan.startDate) result.startDate = normalizeDateForStorage(plan.startDate)
  if (plan.recurrence) {
    result.recurrence = {
      ...plan.recurrence,
      endDate: plan.recurrence.endDate
        ? normalizeDateForStorage(plan.recurrence.endDate)
        : plan.recurrence.endDate,
    }
  }
  if (plan.deletedDates)
    result.deletedDates = plan.deletedDates.map((d) =>
      normalizeDateForStorage(d)
    )
  if (plan.overrides)
    result.overrides = plan.overrides.map((o) => ({
      ...o,
      date: normalizeDateForStorage(o.date),
    }))
  return result
}

export type PersistedServiceReportState = {
  serviceReports: TimeEntriesByYear
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
}

/**
 * One-shot migration that walks every persisted Date in the service-report
 * store and re-anchors it via `normalizeDateForStorage`. Bucket keys in
 * `serviceReports[year][month]` are rebuilt from the normalized date so they
 * always match.
 *
 * Idempotent: running it twice yields the same shape (relies on
 * `normalizeDateForStorage` being idempotent across TZ changes).
 */
export const migrateNormalizeDates = (
  state: PersistedServiceReportState
): PersistedServiceReportState => {
  const rebucketed: TimeEntriesByYear = {}
  for (const yearKey of Object.keys(state.serviceReports)) {
    const months = state.serviceReports[yearKey]
    for (const monthKey of Object.keys(months)) {
      for (const report of months[monthKey]) {
        const normalizedDate = preserveOrNormalizeStoredDate(report.date)
        const m = momentStoredDate(normalizedDate)
        const y = m.year()
        const mo = m.month()
        if (!rebucketed[y]) rebucketed[y] = {}
        if (!rebucketed[y][mo]) rebucketed[y][mo] = []
        rebucketed[y][mo].push({ ...report, date: normalizedDate })
      }
    }
  }

  const dayPlans = state.dayPlans.map((p) => ({
    ...p,
    date: preserveOrNormalizeStoredDate(p.date),
  }))

  const recurringPlans = state.recurringPlans.map((p) => ({
    ...p,
    startDate: preserveOrNormalizeStoredDate(p.startDate),
    recurrence: {
      ...p.recurrence,
      endDate: p.recurrence.endDate
        ? preserveOrNormalizeStoredDate(p.recurrence.endDate)
        : p.recurrence.endDate,
    },
    deletedDates: p.deletedDates?.map((d) => preserveOrNormalizeStoredDate(d)),
    overrides: p.overrides?.map((o) => ({
      ...o,
      date: preserveOrNormalizeStoredDate(o.date),
    })),
  }))

  return {
    serviceReports: rebucketed,
    dayPlans,
    recurringPlans,
  }
}

/** Default start time for plans that have no explicit time set: noon. */
export const DEFAULT_START_TIME_IN_MINUTES = 720

/**
 * Returns the effective start time for a plan or override. Falls back to noon
 * (720) when the field is unset, so legacy plans without a stored time render
 * as noon without requiring a data migration.
 */
export const getStartTimeInMinutes = (
  plan: Pick<
    DayPlan | RecurringPlan | RecurringPlanOverride,
    'startTimeInMinutes'
  >
): number => plan.startTimeInMinutes ?? DEFAULT_START_TIME_IN_MINUTES

/**
 * Combines a noon-UTC anchored calendar date with a wall-clock
 * minutes-since-midnight value into a local-time Date suitable for a datetime
 * picker's `value` prop. The returned Date is in the device's local time.
 */
export const combineDateAndStartTime = (
  date: Date | string,
  startTimeInMinutes?: number
): Date => {
  const minutes = startTimeInMinutes ?? DEFAULT_START_TIME_IN_MINUTES
  const m = momentStoredDate(date)
  const d = new Date(m.year(), m.month(), m.date(), 0, 0, 0, 0)
  d.setMinutes(minutes)
  return d
}

/**
 * Splits a local-time Date (typically from a datetime picker's `onChange`) into
 * the noon-UTC anchored calendar date and the local wall-clock minutes since
 * midnight.
 */
export const splitDateAndStartTime = (
  localDate: Date
): { date: Date; startTimeInMinutes: number } => ({
  date: normalizeDateForStorage(localDate),
  startTimeInMinutes: localDate.getHours() * 60 + localDate.getMinutes(),
})

// `formatStartTime` moved to `@/lib/dates` (the read-time display module).
