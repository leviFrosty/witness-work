import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import moment from 'moment'
import {
  consecutiveMonthsStreak,
  flattenDailyMinutes,
} from '@/features/profile/lib/profileStats'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import type { TimeEntriesByYear, TimeEntry } from '@/types/timeEntry'

// Mid-October 2026.
const now = new Date(2026, 9, 7, 12)

const entry = (
  month: number,
  day: number,
  minutes: number,
  extra: Partial<TimeEntry> = {}
): TimeEntry => ({
  id: `${month}-${day}-${minutes}-${extra.rollover ? 'r' : ''}`,
  date: new Date(2026, month, day, 12),
  hours: 0,
  minutes,
  ...extra,
})

const byMonth = (entries: TimeEntry[]): TimeEntriesByYear => {
  const out: TimeEntriesByYear = {}
  for (const e of entries) {
    const year = String(e.date.getFullYear())
    const month = String(e.date.getMonth())
    out[year] ??= {}
    out[year][month] = [...(out[year][month] ?? []), e]
  }
  return out
}

const streak = (
  entries: TimeEntry[],
  entryModeFor: (month: CalendarMonth) => 'checkbox' | 'hours'
) => {
  const reports = byMonth(entries)
  return consecutiveMonthsStreak(
    { daily: flattenDailyMinutes(reports), reports, entryModeFor },
    now
  )
}

const checkbox = () => 'checkbox' as const
const hours = () => 'hours' as const

describe('consecutiveMonthsStreak — checkbox months', () => {
  it('counts months checked off with the 0h "shared" entry', () => {
    const shared = [entry(7, 4, 0), entry(8, 4, 0), entry(9, 4, 0)]
    expect(streak(shared, checkbox)).toBe(3)
  })

  it("doesn't break on a current month not checked off yet", () => {
    const shared = [entry(6, 4, 0), entry(7, 4, 0), entry(8, 4, 0)]
    expect(streak(shared, checkbox)).toBe(3)
  })

  it('stops at a month with no entry', () => {
    expect(streak([entry(7, 4, 0), entry(9, 4, 0)], checkbox)).toBe(1)
    expect(streak([], checkbox)).toBe(0)
  })

  it('counts logged hours as shared (Hours Logging)', () => {
    expect(streak([entry(8, 12, 90), entry(9, 2, 0)], checkbox)).toBe(2)
  })

  it('ignores Time Rollover entries', () => {
    // Aug's remainder moved to Sep: -30 on Aug 31, +30 on Sep 1.
    const rolloverOnly = [
      entry(7, 4, 90),
      entry(7, 31, -30, { rollover: true }),
      entry(8, 1, 30, { rollover: true }),
      entry(9, 4, 0),
    ]
    expect(streak(rolloverOnly, checkbox)).toBe(1)
  })
})

describe('consecutiveMonthsStreak — hours months', () => {
  it('counts months with logged minutes', () => {
    expect(streak([entry(7, 4, 60), entry(8, 4, 60)], hours)).toBe(2)
  })

  it("still doesn't count a 0h entry", () => {
    expect(streak([entry(7, 4, 60), entry(8, 4, 0)], hours)).toBe(0)
  })

  it('judges each month by the role that applied then', () => {
    // Kingdom Publisher through September, Regular Pioneer from October.
    const roleHistory = (month: CalendarMonth) =>
      month.year === 2026 && month.month >= 9 ? 'hours' : 'checkbox'
    const entries = [
      entry(6, 4, 0),
      entry(7, 4, 0),
      entry(8, 4, 0),
      entry(9, 2, 120),
    ]
    expect(streak(entries, roleHistory)).toBe(4)
  })

  it('matches the previous hours streak for any data (pioneers unchanged)', () => {
    // The months walk before checkbox months existed, verbatim.
    const legacy = (daily: Map<string, number>) => {
      let count = 0
      const cursor = moment(now).startOf('month')
      for (let i = 0; i < 600; i++) {
        let hasDay = false
        for (let d = 0; d < cursor.daysInMonth(); d++) {
          const key = cursor.clone().add(d, 'days').format('YYYY-MM-DD')
          if ((daily.get(key) || 0) > 0) {
            hasDay = true
            break
          }
        }
        if (!hasDay) {
          if (i === 0) {
            cursor.subtract(1, 'month')
            continue
          }
          break
        }
        count++
        cursor.subtract(1, 'month')
      }
      return count
    }
    const arbEntry = fc.record({
      monthsAgo: fc.integer({ min: 0, max: 14 }),
      day: fc.integer({ min: 1, max: 28 }),
      minutes: fc.integer({ min: -60, max: 180 }),
      rollover: fc.boolean(),
    })
    fc.assert(
      fc.property(fc.array(arbEntry, { maxLength: 40 }), (raw) => {
        const entries = raw.map(({ monthsAgo, day, minutes, rollover }, i) => ({
          id: String(i),
          date: moment(now)
            .startOf('month')
            .subtract(monthsAgo, 'months')
            .date(day)
            .hour(12)
            .toDate(),
          hours: 0,
          minutes,
          rollover,
        }))
        const reports = byMonth(entries)
        const daily = flattenDailyMinutes(reports)
        expect(
          consecutiveMonthsStreak({ daily, reports, entryModeFor: hours }, now)
        ).toBe(legacy(daily))
      })
    )
  })
})
