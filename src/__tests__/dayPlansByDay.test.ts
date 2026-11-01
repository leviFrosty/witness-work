import { afterAll, afterEach, describe, expect, it } from 'vitest'
import moment from 'moment'

import { dayPlansByDayKey, dayPlansOnLocalDay } from '@/lib/dayPlansByDay'
import {
  isStoredDateOnLocalDay,
  momentStoredDate,
  normalizeDateForStorage,
  storedDayKey,
} from '@/lib/normalizeDate'
import {
  plannedMinutesForDay,
  plannedMinutesThroughDayForMonth,
  plannedMinutesThroughEachDayOfMonth,
} from '@/lib/recurrence'
import type { DayPlan } from '@/types/timeEntry'

const originalTZ = process.env.TZ
const setTZ = (tz: string) => {
  process.env.TZ = tz
}
const tzs = [
  'Pacific/Auckland',
  'Pacific/Kiritimati',
  'Asia/Kolkata',
  'UTC',
  'America/Los_Angeles',
  'Etc/GMT+12',
]

afterEach(() => setTZ('America/Los_Angeles'))
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

const random = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 2 ** 32
  return seed / 2 ** 32
}

const START = Date.UTC(2023, 8, 1, 12)
const DAYS = 1100

const makeDayPlans = (seed: number): DayPlan[] => {
  const next = random(seed)
  return Array.from({ length: 1000 }, (_, i) => {
    const anchored = new Date(START + Math.floor(next() * DAYS) * 864e5)
    const raw = new Date(
      anchored.getTime() + Math.floor(next() * 24) * 36e5 - 12 * 36e5
    )
    const kind = next()
    const date =
      kind < 0.45
        ? anchored
        : kind < 0.9
          ? anchored.toISOString()
          : kind < 0.95
            ? raw
            : raw.toISOString()
    return {
      id: `plan-${i}`,
      date: date as Date,
      minutes: 15 * (1 + Math.floor(next() * 16)),
    }
  })
}

const scanMonthDay = (dayDate: Date, dayPlans: DayPlan[]) =>
  dayPlans.filter((plan) =>
    momentStoredDate(plan.date).isSame(
      momentStoredDate(normalizeDateForStorage(dayDate)),
      'day'
    )
  )

const scanThroughEachDayOfMonth = (
  month: number,
  year: number,
  dayPlans: DayPlan[]
) => {
  const selectedMonth = moment({ year, month, date: 1 }).startOf('month')
  let count = 0
  return Array.from({ length: selectedMonth.daysInMonth() }, (_, i) => {
    const dayDate = selectedMonth
      .clone()
      .date(i + 1)
      .toDate()
    count += plannedMinutesForDay(dayDate, scanMonthDay(dayDate, dayPlans), [])
    return count
  })
}

const ids = (plans: DayPlan[]) => plans.map((p) => p.id)

describe('dayPlansByDayKey', () => {
  it.each(tzs)(
    'matches scanning every Day Plan in %s',
    (tz) => {
      setTZ(tz)

      const dayPlans = makeDayPlans(tz.length)

      for (let d = -3; d < DAYS + 3; d += 7) {
        const utc = new Date(START + d * 864e5)
        const dayString = utc.toISOString().slice(0, 10)
        const localDay = moment(dayString).toDate()
        expect(ids(dayPlansOnLocalDay(dayPlans, localDay))).toEqual(
          ids(scanMonthDay(localDay, dayPlans))
        )
        expect(ids(dayPlansOnLocalDay(dayPlans, dayString))).toEqual(
          ids(dayPlans.filter((p) => isStoredDateOnLocalDay(p.date, dayString)))
        )
      }
      for (let m = 0; m < 37; m += 4) {
        const month = moment.utc(START).add(m, 'months')
        const expected = scanThroughEachDayOfMonth(
          month.month(),
          month.year(),
          dayPlans
        )
        expect(
          plannedMinutesThroughEachDayOfMonth(
            month.month(),
            month.year(),
            dayPlans,
            []
          )
        ).toEqual(expected)
        expect(
          plannedMinutesThroughDayForMonth(
            month.month(),
            month.year(),
            17,
            dayPlans,
            []
          )
        ).toBe(expected[16])
      }
    },
    30_000
  )

  it('keys anchored ISO strings like moment does', () => {
    const next = random(7)
    for (let i = 0; i < 2000; i++) {
      const iso = new Date(
        Date.UTC(1900, 0, 1, 12) + Math.floor(next() * 80000) * 864e5
      ).toISOString()
      expect(storedDayKey(iso)).toBe(momentStoredDate(iso).format('YYYY-MM-DD'))
    }

    setTZ('Pacific/Auckland')
    expect(storedDayKey('2024-06-01T13:00:00.000Z')).toBe('2024-06-02')
  })

  it('builds once per Day Plans array', () => {
    const dayPlans = makeDayPlans(1)
    expect(dayPlansByDayKey(dayPlans)).toBe(dayPlansByDayKey(dayPlans))
    expect(dayPlansByDayKey([...dayPlans])).not.toBe(dayPlansByDayKey(dayPlans))
  })

  it('re-keys Day Plans off the anchor when the time zone changes', () => {
    setTZ('America/Los_Angeles')
    const anchoredPlan = { id: 'anchored', date: '2024-06-01T12:00:00.000Z' }
    const rawString = { id: 'raw-string', date: '2024-06-01T13:00:00.000Z' }
    const rawDate = { id: 'raw-date', date: new Date('2024-06-01T14:00:00Z') }
    const dayPlans = [anchoredPlan, rawString, rawDate].map((p) => ({
      ...p,
      date: p.date as Date,
      minutes: 60,
    }))

    expect(ids(dayPlansOnLocalDay(dayPlans, '2024-06-01'))).toEqual([
      'anchored',
      'raw-string',
      'raw-date',
    ])

    setTZ('Pacific/Auckland')
    expect(ids(dayPlansOnLocalDay(dayPlans, '2024-06-01'))).toEqual([
      'anchored',
    ])
    expect(ids(dayPlansOnLocalDay(dayPlans, '2024-06-02'))).toEqual([
      'raw-string',
      'raw-date',
    ])
  })

  it('matches scanning every Day Plan after the time zone changes', () => {
    setTZ('America/Los_Angeles')
    const dayPlans = makeDayPlans(3)
    dayPlansByDayKey(dayPlans)
    for (const tz of tzs) {
      setTZ(tz)
      for (let d = -3; d < DAYS + 3; d += 11) {
        const dayString = new Date(START + d * 864e5).toISOString().slice(0, 10)
        expect(ids(dayPlansOnLocalDay(dayPlans, dayString))).toEqual(
          ids(dayPlans.filter((p) => isStoredDateOnLocalDay(p.date, dayString)))
        )
      }
    }
  })

  it('keeps the index of normalized Day Plans across time zones', () => {
    setTZ('America/Los_Angeles')
    const dayPlans = makeDayPlans(4).map((p) => ({
      ...p,
      date: normalizeDateForStorage(p.date),
    }))
    const index = dayPlansByDayKey(dayPlans)
    setTZ('Pacific/Auckland')
    expect(dayPlansByDayKey(dayPlans)).toBe(index)

    const mixed = makeDayPlans(4)
    const before = dayPlansByDayKey(mixed)
    expect(dayPlansByDayKey(mixed)).toBe(before)
    setTZ('America/Los_Angeles')
    expect(dayPlansByDayKey(mixed)).not.toBe(before)
  })

  it('totals a Service Year of 1,000 Day Plans quickly', () => {
    const dayPlans = makeDayPlans(2)
    const start = performance.now()
    for (let m = 0; m < 12; m++) {
      const month = moment({ year: 2024, month: 8 }).add(m, 'months')
      plannedMinutesThroughDayForMonth(
        month.month(),
        month.year(),
        31,
        [...dayPlans],
        []
      )
    }

    expect(performance.now() - start).toBeLessThan(100)
  })
})
