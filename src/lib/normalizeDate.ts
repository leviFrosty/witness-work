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
 * True when a stored value sits on the noon-UTC anchor, so its calendar day
 * doesn't depend on the device's time zone. `momentStoredDate` reads any other
 * value as the local day it falls on _now_, so don't cache that read.
 */
export const isStoredDateAnchored = (date: Date | string): boolean =>
  isAnchoredNoonUtc(date instanceof Date ? date : new Date(date))

/**
 * Variant for the migration / iCloud-merge paths, where the input is already a
 * _stored_ Date — either a freshly-anchored noon-UTC value from a post-fix
 * peer, or a pre-fix raw value. Preserves already-anchored values so syncs
 * between devices in different TZs don't drift the calendar day on every pull.
 * Pre-fix values fall through to local extraction (best-effort, locked in to
 * the device's current TZ).
 *
 * Accepts ISO strings too: persisted and synced state is JSON with no reviver,
 * so after a restart every stored date is a string. Treating those as fresh
 * input re-anchors them onto the next day at UTC+12 and beyond on every sync.
 *
 * Do NOT use this on user-typed input — `normalizeDateForStorage` is the
 * write-path entry point. The shortcut here is unsafe for fresh user input
 * because midnight local in NZST (UTC+12) is _coincidentally_ noon UTC of the
 * prior day, and would be misread as already-anchored.
 */
export const preserveOrNormalizeStoredDate = (date: Date | string): Date => {
  const instant = date instanceof Date ? date : new Date(date)
  if (isAnchoredNoonUtc(instant)) {
    return new Date(
      Date.UTC(
        instant.getUTCFullYear(),
        instant.getUTCMonth(),
        instant.getUTCDate(),
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
 * Write-path variant for update actions: a record's own stored date handed back
 * unchanged (an edit that spreads the stored record) keeps its day.
 * Re-anchoring it would read the anchor's local day, which is the next day at
 * UTC+12 and beyond. Only the stored value itself counts — the same Date, or
 * the same instant as a serialized string. A fresh Date at that instant may be
 * local midnight at UTC+12, which names the next day, so it's normalized like
 * any other input. Callers must pass the stored value itself or a local-mode
 * Date, never a copy of the anchor (`new Date(stored)`): a copy is read as
 * local input and moves a day forward at UTC+12 and beyond.
 */
export const normalizeDateForUpdate = (
  date: Date | string,
  ...stored: (Date | string | null | undefined)[]
): Date => {
  const kept = stored.find(
    (value): value is Date | string =>
      value != null &&
      (value === date ||
        (typeof date === 'string' &&
          new Date(date).getTime() === new Date(value).getTime()))
  )
  if (kept === undefined) return normalizeDateForStorage(date)
  // The same Date back, so a later edit from a stale copy still matches.
  return kept instanceof Date && isAnchoredNoonUtc(kept)
    ? kept
    : preserveOrNormalizeStoredDate(kept)
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

/**
 * True for a noon-UTC ISO string, the form rehydrated stored days take.
 * `storedDayKey` slices its key out without parsing, so the key never depends
 * on the device's time zone.
 */
export const isAnchoredIsoString = (date: Date | string): date is string =>
  typeof date === 'string' &&
  date.length === 24 &&
  date.endsWith('T12:00:00.000Z')

/** The `YYYY-MM-DD` calendar day carried by a stored noon-UTC anchor. */
export const storedDayKey = (date: Date | string): string => {
  // Rehydrated state is JSON, so most stored days arrive as anchored ISO
  // strings, which already start with their key.
  if (isAnchoredIsoString(date)) return date.slice(0, 10)
  return momentStoredDate(date).format('YYYY-MM-DD')
}

/**
 * The `YYYY-MM-DD` key of a local calendar day, comparable with `storedDayKey`.
 * Takes the same `localDay` forms as `isStoredDateOnLocalDay`; compute it once
 * when comparing many stored days against one day.
 */
export const localDayKey = (localDay: Date | string | moment.Moment): string =>
  moment(localDay).format('YYYY-MM-DD')

/**
 * Whole days from `from`'s local date to `to`'s, negative when `to` is earlier.
 * Compares dates rather than the time between their midnights: where clocks
 * change at midnight (Havana, Santiago, Cairo), that day starts at 1:00 and the
 * day after it is only 23 hours away, so a `diff` of `startOf('day')`s comes up
 * a day short.
 */
export const calendarDaysBetween = (
  from: moment.MomentInput,
  to: moment.MomentInput
): number => {
  const day = (input: moment.MomentInput) => {
    const date = moment(input)
    return Date.UTC(date.year(), date.month(), date.date())
  }
  return Math.round((day(to) - day(from)) / 86_400_000)
}

/**
 * True when a stored calendar-day anchor falls on the given local calendar day.
 * `localDay` expresses a day in _local_ mode — a `YYYY-MM-DD` string (e.g.
 * CalendarDay's `dateString`), a local-mode Date, or a local-mode moment
 * cursor. Never pass another stored anchor as `localDay`; compare
 * `storedDayKey`s instead.
 */
export const isStoredDateOnLocalDay = (
  stored: Date | string,
  localDay: Date | string | moment.Moment
): boolean => storedDayKey(stored) === localDayKey(localDay)

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

/**
 * Same as `normalizeRecurringPlan` but tolerates missing fields (for updates).
 * Dates handed back unchanged from `existing` keep their stored day (see
 * `normalizeDateForUpdate`).
 */
export const normalizePartialRecurringPlan = (
  plan: Partial<RecurringPlan>,
  existing?: RecurringPlan
): Partial<RecurringPlan> => {
  const result: Partial<RecurringPlan> = { ...plan }
  if (plan.startDate)
    result.startDate = normalizeDateForUpdate(
      plan.startDate,
      existing?.startDate
    )
  if (plan.recurrence) {
    result.recurrence = {
      ...plan.recurrence,
      endDate: plan.recurrence.endDate
        ? normalizeDateForUpdate(
            plan.recurrence.endDate,
            existing?.recurrence.endDate
          )
        : plan.recurrence.endDate,
    }
  }
  if (plan.deletedDates)
    result.deletedDates = plan.deletedDates.map((d) =>
      normalizeDateForUpdate(d, ...(existing?.deletedDates ?? []))
    )
  if (plan.overrides)
    result.overrides = plan.overrides.map((o) => ({
      ...o,
      date: normalizeDateForUpdate(
        o.date,
        ...(existing?.overrides ?? []).map((e) => e.date)
      ),
    }))
  return result
}

export type PersistedServiceReportState = {
  serviceReports: TimeEntriesByYear
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
}

/**
 * Walks every persisted Date in the service-report state and re-anchors it.
 * Bucket keys in `serviceReports[year][month]` are rebuilt from the normalized
 * date so they always match.
 *
 * Defaults to `preserveOrNormalizeStoredDate` (iCloud merge/restore: keeps
 * anchored values, re-anchors legacy ones) and is idempotent that way. The
 * pre-v2 persist migration passes `normalizeDateForStorage`: that data predates
 * anchoring, so a local midnight at UTC+12 must not be mistaken for an anchor.
 */
export const migrateNormalizeDates = (
  state: PersistedServiceReportState,
  normalize: (date: Date | string) => Date = preserveOrNormalizeStoredDate
): PersistedServiceReportState => {
  const rebucketed: TimeEntriesByYear = {}
  for (const yearKey of Object.keys(state.serviceReports)) {
    const months = state.serviceReports[yearKey]
    for (const monthKey of Object.keys(months)) {
      for (const report of months[monthKey]) {
        const normalizedDate = normalize(report.date)
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
    date: normalize(p.date),
  }))

  const recurringPlans = state.recurringPlans.map((p) => ({
    ...p,
    startDate: normalize(p.startDate),
    recurrence: {
      ...p.recurrence,
      endDate: p.recurrence.endDate
        ? normalize(p.recurrence.endDate)
        : p.recurrence.endDate,
    },
    deletedDates: p.deletedDates?.map((d) => normalize(d)),
    overrides: p.overrides?.map((o) => ({
      ...o,
      date: normalize(o.date),
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
 * `minutes` past midnight on `day`'s calendar day, on the wall clock: 600 is
 * 10:00 even on a day clocks change, when 600 elapsed minutes after midnight is
 * 9:00 or 11:00. A time the change skips moves past it (2:30 → 3:30), and 1440
 * or more runs into the next day.
 */
export const atMinutesOfDay = (
  day: moment.MomentInput,
  minutes: number
): moment.Moment => {
  const m = moment(day)
  return moment(new Date(m.year(), m.month(), m.date(), 0, minutes))
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
