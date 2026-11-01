import { afterAll, describe, expect, it, vi } from 'vitest'
import moment from 'moment'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import {
  getEffectiveMinutesForRecurringPlan,
  getPlansIntersectingDay,
  getSetStartTimeInMinutesForRecurringPlan,
  isRecurringPlanAnytimeOnDate,
} from '@/lib/recurrence'
import { momentStoredDate, normalizeDateForStorage } from '@/lib/normalizeDate'
import {
  MonthlyByWeekdayConfig,
  RecurringPlan,
  RecurringPlanFrequencies,
  RecurringPlanOverride,
} from '@/types/timeEntry'

const originalTZ = process.env.TZ
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

const day = (iso: string) => normalizeDateForStorage(iso)

const plan = (
  frequency: RecurringPlanFrequencies,
  fields: Partial<RecurringPlan> & {
    interval?: number
    endDate?: Date | null
    monthlyByWeekdayConfig?: MonthlyByWeekdayConfig
  } = {}
): RecurringPlan => {
  const {
    interval = 1,
    endDate = null,
    monthlyByWeekdayConfig,
    ...rest
  } = fields
  return {
    id: `plan-${frequency}`,
    startDate: day('2026-01-05'),
    minutes: 60,
    recurrence: { frequency, interval, endDate, monthlyByWeekdayConfig },
    ...rest,
  }
}

const isOn = (p: RecurringPlan, iso: string) =>
  getPlansIntersectingDay(moment(iso).toDate(), [p]).length > 0

describe('getPlansIntersectingDay', () => {
  it('leaves out a skipped day and keeps the rest of the pattern', () => {
    const weekly = plan(RecurringPlanFrequencies.WEEKLY, {
      deletedDates: [day('2026-01-12')],
    })
    expect(isOn(weekly, '2026-01-05')).toBe(true)
    expect(isOn(weekly, '2026-01-12')).toBe(false)
    expect(isOn(weekly, '2026-01-19')).toBe(true)
  })

  it('includes the start and end days', () => {
    const weekly = plan(RecurringPlanFrequencies.WEEKLY, {
      endDate: day('2026-01-19'),
    })
    expect(isOn(weekly, '2025-12-29')).toBe(false)
    expect(isOn(weekly, '2026-01-05')).toBe(true)
    expect(isOn(weekly, '2026-01-19')).toBe(true)
    expect(isOn(weekly, '2026-01-26')).toBe(false)
  })

  it('sees an edit, which replaces the plan object', () => {
    const weekly = plan(RecurringPlanFrequencies.WEEKLY)
    expect(isOn(weekly, '2026-01-12')).toBe(true)
    const skipped = { ...weekly, deletedDates: [day('2026-01-12')] }
    expect(isOn(skipped, '2026-01-12')).toBe(false)
  })
})

describe('recurring plan overrides', () => {
  it('uses the first override on a day', () => {
    const weekly = plan(RecurringPlanFrequencies.WEEKLY, {
      overrides: [
        { date: day('2026-01-12'), minutes: 30, startTimeInMinutes: 540 },
        { date: day('2026-01-12'), minutes: 90, anytime: true },
      ],
    })
    const date = moment('2026-01-12').toDate()
    expect(getEffectiveMinutesForRecurringPlan(weekly, date)).toBe(30)
    expect(getSetStartTimeInMinutesForRecurringPlan(weekly, date)).toBe(540)
    expect(isRecurringPlanAnytimeOnDate(weekly, date)).toBe(false)
    expect(
      getEffectiveMinutesForRecurringPlan(weekly, moment('2026-01-19').toDate())
    ).toBe(60)
  })
})

const legacyOverride = (
  p: RecurringPlan,
  date: Date
): RecurringPlanOverride | undefined => {
  const target = momentStoredDate(normalizeDateForStorage(date))
  return p.overrides?.find((o) =>
    momentStoredDate(o.date).isSame(target, 'day')
  )
}

const legacyIsOn = (p: RecurringPlan, date: Date): boolean => {
  const target = momentStoredDate(normalizeDateForStorage(date))
  if (p.deletedDates?.some((d) => momentStoredDate(d).isSame(target, 'day')))
    return false
  const start = momentStoredDate(p.startDate)
  const end = p.recurrence.endDate
    ? momentStoredDate(p.recurrence.endDate)
    : null
  const inRange =
    target.isSameOrAfter(start) && (!end || target.isSameOrBefore(end))
  const daysDiff = target.diff(start, 'days')
  const { frequency, interval, monthlyByWeekdayConfig: config } = p.recurrence
  switch (frequency) {
    case RecurringPlanFrequencies.WEEKLY:
      return daysDiff % (interval * 7) === 0 && inRange
    case RecurringPlanFrequencies.BI_WEEKLY:
      return daysDiff % (interval * 14) === 0 && inRange
    case RecurringPlanFrequencies.MONTHLY:
      return target.date() === start.date() && inRange
    case RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY:
      return (
        !!config &&
        target.day() === config.weekday &&
        (config.weekOfMonth === -1
          ? target.date() + 7 > target.daysInMonth()
          : Math.ceil(target.date() / 7) === config.weekOfMonth) &&
        inRange
      )
    default:
      return false
  }
}

const random = (() => {
  let seed = 42
  return () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31
    return seed / 2 ** 31
  }
})()

const walkStart = moment('2025-08-25')
const WALK_DAYS = 380
const randomWalkDays = (count: number, toDate: (iso: string) => Date) =>
  Array.from({ length: count }, () =>
    toDate(
      walkStart
        .clone()
        .add(Math.floor(random() * WALK_DAYS), 'days')
        .format('YYYY-MM-DD')
    )
  )

const fuzzPlan = (
  id: string,
  recurrence: RecurringPlan['recurrence'],
  toDate: (iso: string) => Date
): RecurringPlan => ({
  id,
  startDate: toDate('2025-09-03'),
  minutes: 120,
  startTimeInMinutes: 600,
  recurrence,
  deletedDates: randomWalkDays(80, toDate),
  overrides: randomWalkDays(40, toDate).map((date, i) => ({
    date,
    minutes: i * 5,
    ...(i % 3 ? { startTimeInMinutes: i * 10 } : {}),
    ...(i % 4 ? {} : { anytime: true }),
  })),
})

process.env.TZ = 'America/Los_Angeles'
const anchored = (iso: string) => normalizeDateForStorage(iso)
const raw = (iso: string) => moment(iso).hour(18).toDate()
const fuzzPlans = [
  fuzzPlan(
    'weekly',
    {
      frequency: RecurringPlanFrequencies.WEEKLY,
      interval: 1,
      endDate: anchored('2026-07-15'),
    },
    anchored
  ),
  fuzzPlan(
    'every-3-weeks',
    { frequency: RecurringPlanFrequencies.WEEKLY, interval: 3, endDate: null },
    anchored
  ),
  fuzzPlan(
    'bi-weekly',
    {
      frequency: RecurringPlanFrequencies.BI_WEEKLY,
      interval: 1,
      endDate: null,
    },
    anchored
  ),
  fuzzPlan(
    'monthly',
    {
      frequency: RecurringPlanFrequencies.MONTHLY,
      interval: 1,
      endDate: anchored('2026-06-03'),
    },
    anchored
  ),
  fuzzPlan(
    'second-tuesday',
    {
      frequency: RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY,
      interval: 1,
      endDate: null,
      monthlyByWeekdayConfig: { weekday: 2, weekOfMonth: 2 },
    },
    anchored
  ),
  fuzzPlan(
    'last-saturday',
    {
      frequency: RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY,
      interval: 1,
      endDate: null,
      monthlyByWeekdayConfig: { weekday: 6, weekOfMonth: -1 },
    },
    anchored
  ),
  fuzzPlan(
    'raw-weekly',
    {
      frequency: RecurringPlanFrequencies.WEEKLY,
      interval: 1,
      endDate: raw('2026-07-15'),
    },
    raw
  ),
]

describe.each(['America/Los_Angeles', 'Pacific/Auckland', 'UTC'])(
  'compiled matching in %s',
  (tz) => {
    it('agrees with the per-entry matching on every day', () => {
      process.env.TZ = tz
      let matches = 0
      for (let i = 0; i < WALK_DAYS; i++) {
        const date = walkStart.clone().add(i, 'days').toDate()
        const ids = getPlansIntersectingDay(date, fuzzPlans).map((p) => p.id)
        const expected = fuzzPlans.filter((p) => legacyIsOn(p, date))
        expect(ids).toEqual(expected.map((p) => p.id))
        matches += expected.length

        for (const p of fuzzPlans) {
          const override = legacyOverride(p, date)
          expect(getEffectiveMinutesForRecurringPlan(p, date)).toBe(
            override ? override.minutes : p.minutes
          )
          expect(getSetStartTimeInMinutesForRecurringPlan(p, date)).toBe(
            override?.startTimeInMinutes ?? p.startTimeInMinutes
          )
          expect(isRecurringPlanAnytimeOnDate(p, date)).toBe(
            override?.anytime ?? !!p.anytime
          )
        }
      }

      expect(matches).toBeGreaterThan(100)
    })
  }
)
