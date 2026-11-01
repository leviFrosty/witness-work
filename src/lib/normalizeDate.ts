import moment from 'moment'
import {
  DayPlan,
  RecurringPlan,
  RecurringPlanOverride,
  TimeEntriesByYear,
} from '@/types/timeEntry'

export const normalizeDateForStorage = (date: Date | string): Date => {
  const m = moment(date)
  return new Date(Date.UTC(m.year(), m.month(), m.date(), 12, 0, 0, 0))
}

const isAnchoredNoonUtc = (d: Date): boolean =>
  d.getUTCHours() === 12 &&
  d.getUTCMinutes() === 0 &&
  d.getUTCSeconds() === 0 &&
  d.getUTCMilliseconds() === 0

export const isStoredDateAnchored = (date: Date | string): boolean =>
  isAnchoredNoonUtc(date instanceof Date ? date : new Date(date))

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

  return kept instanceof Date && isAnchoredNoonUtc(kept)
    ? kept
    : preserveOrNormalizeStoredDate(kept)
}

export const momentStoredDate = (date: Date | string): moment.Moment => {
  const instant = date instanceof Date ? date : new Date(date)
  if (isAnchoredNoonUtc(instant)) return moment.utc(instant)
  return moment.utc(normalizeDateForStorage(date))
}

export const localDayFromUtcCursor = (cursor: moment.Moment): Date =>
  new Date(cursor.year(), cursor.month(), cursor.date(), 12)

export const isAnchoredIsoString = (date: Date | string): date is string =>
  typeof date === 'string' &&
  date.length === 24 &&
  date.endsWith('T12:00:00.000Z')

export const storedDayKey = (date: Date | string): string => {
  if (isAnchoredIsoString(date)) return date.slice(0, 10)
  return momentStoredDate(date).format('YYYY-MM-DD')
}

export const localDayKey = (localDay: Date | string | moment.Moment): string =>
  moment(localDay).format('YYYY-MM-DD')

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

export const isStoredDateOnLocalDay = (
  stored: Date | string,
  localDay: Date | string | moment.Moment
): boolean => storedDayKey(stored) === localDayKey(localDay)

export const storedDateToLocalDate = (date: Date | string): Date =>
  localDayFromUtcCursor(momentStoredDate(date))

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

export const DEFAULT_START_TIME_IN_MINUTES = 720

export const getStartTimeInMinutes = (
  plan: Pick<
    DayPlan | RecurringPlan | RecurringPlanOverride,
    'startTimeInMinutes'
  >
): number => plan.startTimeInMinutes ?? DEFAULT_START_TIME_IN_MINUTES

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

export const atMinutesOfDay = (
  day: moment.MomentInput,
  minutes: number
): moment.Moment => {
  const m = moment(day)
  return moment(new Date(m.year(), m.month(), m.date(), 0, minutes))
}

export const splitDateAndStartTime = (
  localDate: Date
): { date: Date; startTimeInMinutes: number } => ({
  date: normalizeDateForStorage(localDate),
  startTimeInMinutes: localDate.getHours() * 60 + localDate.getMinutes(),
})
