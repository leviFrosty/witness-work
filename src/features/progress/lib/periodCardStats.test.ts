import { describe, expect, it } from 'vitest'
import {
  allMonthTotals,
  bestMonth,
  firstRecordMonth,
  monthlyAverage,
  monthsBetween,
  monthsShared,
  serviceYearMonthTotals,
  studyStats,
  visitStats,
  yearlyAverage,
  type MonthTotal,
} from '@/features/progress/lib/periodCardStats'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import type { Contact } from '@/types/contact'
import type { TimeEntriesByYear, TimeEntry } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'

const entry = (day: string, hours: number, extra: Partial<TimeEntry> = {}) =>
  ({
    id: `${day}-${hours}-${extra.categoryId ?? ''}`,
    date: new Date(`${day}T12:00:00.000Z`),
    hours,
    minutes: 0,
    ...extra,
  }) as TimeEntry

const byMonth = (...entries: TimeEntry[]): TimeEntriesByYear => {
  const out: TimeEntriesByYear = {}
  for (const e of entries) {
    const year = e.date.getUTCFullYear()
    const month = e.date.getUTCMonth()
    out[year] ??= {}
    out[year][month] = [...(out[year][month] ?? []), e]
  }
  return out
}

const total = (year: number, month: number, hours: number): MonthTotal => ({
  year,
  month,
  minutes: hours * 60,
})

describe('serviceYearMonthTotals', () => {
  it('lists Sep → Aug, each month capped by its own limit', () => {
    const reports = byMonth(
      entry('2025-09-10', 40),
      entry('2025-09-11', 30, { categoryId: LDC_BUILTIN_CATEGORY_ID }),
      entry('2026-03-02', 10)
    )
    const totals = serviceYearMonthTotals(reports, 2025, () => 55 * 60)
    expect(totals).toHaveLength(12)
    expect(totals[0]).toEqual({ year: 2025, month: 8, minutes: 55 * 60 })
    expect(totals[6]).toEqual({ year: 2026, month: 2, minutes: 10 * 60 })
    expect(totals[11]).toEqual({ year: 2026, month: 7, minutes: 0 })

    expect(serviceYearMonthTotals(reports, 2025, () => null)[0].minutes).toBe(
      70 * 60
    )
  })
})

describe('monthlyAverage', () => {
  const totals = [
    total(2025, 8, 0),
    total(2025, 9, 40),
    total(2025, 10, 60),
    total(2025, 11, 10),
  ]

  it('averages from the first month with time to the last that ended', () => {
    expect(monthlyAverage(totals, { year: 2025, month: 11 })).toEqual({
      averageMinutes: 50 * 60,
      months: 2,
    })
  })

  it('uses the month under way while it is the only one', () => {
    expect(monthlyAverage(totals, { year: 2025, month: 9 })).toEqual({
      averageMinutes: 40 * 60,
      months: 1,
    })
  })

  it('has nothing to say without time', () => {
    expect(monthlyAverage(totals, { year: 2025, month: 8 })).toBeNull()
  })
})

describe('bestMonth', () => {
  it('picks the most time, the earliest on a tie', () => {
    expect(
      bestMonth([total(2025, 9, 30), total(2025, 10, 50), total(2025, 11, 50)])
    ).toEqual(total(2025, 10, 50))
    expect(bestMonth([total(2025, 9, 0)])).toBeNull()
  })
})

describe('allMonthTotals', () => {
  it('sums raw time per month, oldest first', () => {
    const reports = byMonth(
      entry('2026-02-01', 3),
      entry('2024-11-05', 2),
      entry('2024-11-06', 70, { categoryId: LDC_BUILTIN_CATEGORY_ID })
    )
    expect(allMonthTotals(reports)).toEqual([
      total(2024, 10, 72),
      total(2026, 1, 3),
    ])
    expect(firstRecordMonth(reports)).toEqual({ year: 2024, month: 10 })
    expect(firstRecordMonth({})).toBeNull()
  })
})

describe('monthsShared', () => {
  const reports = byMonth(
    entry('2025-09-03', 0),
    entry('2025-10-03', 2),
    entry('2025-12-03', 1),
    entry('2026-01-03', 0, { rollover: true }),
    entry('2026-02-03', 1),
    entry('2026-03-03', 1)
  )
  const months = monthsBetween(
    { year: 2025, month: 8 },
    { year: 2026, month: 7 }
  )

  it('counts shared months, the open month once it is shared', () => {
    expect(
      monthsShared({
        serviceReports: reports,
        months,
        since: { year: 2025, month: 8 },
        today: { year: 2026, month: 2 },
      })
    ).toEqual({
      shared: 5,
      months: 7,

      missed: [
        { year: 2025, month: 10 },
        { year: 2026, month: 0 },
      ],
      longestRun: 2,
    })
  })

  it("doesn't miss the month under way, or months before the first record", () => {
    const stats = monthsShared({
      serviceReports: reports,
      months,
      since: { year: 2025, month: 9 },
      today: { year: 2026, month: 3 },
    })
    expect(stats.shared).toBe(4)
    expect(stats.months).toBe(6)
    expect(stats.missed).toEqual([
      { year: 2025, month: 10 },
      { year: 2026, month: 0 },
    ])
  })

  it('has nothing to count without a record', () => {
    expect(
      monthsShared({
        serviceReports: {},
        months,
        since: null,
        today: { year: 2026, month: 2 },
      }).months
    ).toBe(0)
  })
})

const contact = (id: string) => ({ id, name: id }) as Contact
const visit = (id: string, date: string, extra: Partial<Visit> = {}): Visit =>
  ({
    id: `${id}-${date}`,
    contact: { id },
    date: new Date(`${date}T15:00:00`),
    isBibleStudy: false,
    ...extra,
  }) as Visit

describe('studyStats', () => {
  const contacts = [contact('ada'), contact('ben'), contact('cy')]
  const conversations = [
    visit('ada', '2025-10-02', { isBibleStudy: true }),
    visit('ada', '2025-10-20', { isBibleStudy: true }),
    visit('ben', '2025-10-05', { isBibleStudy: true }),
    visit('cy', '2026-01-05', { isBibleStudy: true }),
    visit('ben', '2026-01-05'),

    visit('gone', '2026-01-06', { isBibleStudy: true }),
  ]

  it('counts each person once and finds the busiest month', () => {
    const stats = studyStats({ contacts, conversations })
    expect([...stats.contactIds].sort()).toEqual(['ada', 'ben', 'cy'])
    expect(stats.peak).toEqual({ year: 2025, month: 9, count: 2 })
  })

  it('keeps to the range', () => {
    const stats = studyStats({
      contacts,
      conversations,
      inRange: (date) => date.year() === 2026,
    })
    expect([...stats.contactIds]).toEqual(['cy'])
    expect(stats.peak).toEqual({ year: 2026, month: 0, count: 1 })
  })

  it('leaves out studies that came with a shared contact', () => {
    const stats = studyStats({
      contacts: [contact('dee')],
      conversations: [
        visit('dee', '2026-02-02', { isBibleStudy: true, receivedAt: 1 }),
      ],
    })
    expect(stats.contactIds.size).toBe(0)
    expect(stats.peak).toBeNull()
  })
})

describe('visitStats', () => {
  it('counts talks, not-at-homes, people and new contacts', () => {
    const contacts = [
      { ...contact('ada'), createdAt: new Date('2025-10-01T12:00:00') },
      { ...contact('ben'), createdAt: new Date('2024-01-01T12:00:00') },
    ]
    const conversations = [
      visit('ada', '2025-10-02'),
      visit('ada', '2025-10-09'),
      visit('ben', '2025-10-03', { notAtHome: true }),
      visit('ben', '2024-02-03'),
    ]
    expect(
      visitStats({
        contacts,
        conversations,
        inRange: (date) => date.year() === 2025,
      })
    ).toEqual({ talked: 2, notAtHome: 1, people: 1, newContacts: 1 })
    expect(visitStats({ contacts, conversations }).people).toBe(2)
  })

  it('leaves out Visits that came with a shared contact', () => {
    const conversations = [
      visit('ada', '2025-10-02'),
      visit('dee', '2025-10-04', { receivedAt: 1 }),
      visit('dee', '2025-10-05', { notAtHome: true, receivedAt: 1 }),
    ]
    expect(visitStats({ contacts: [], conversations })).toEqual({
      talked: 1,
      notAtHome: 0,
      people: 1,
      newContacts: 0,
    })
  })
})

describe('yearlyAverage', () => {
  it('averages the service years that ended', () => {
    expect(
      yearlyAverage(
        [
          { endYear: 2024, minutes: 600 * 60 },
          { endYear: 2025, minutes: 400 * 60 },
          { endYear: 2026, minutes: 50 * 60 },
        ],
        2026
      )
    ).toEqual({ averageMinutes: 500 * 60, years: 2, currentOnly: false })
  })

  it('uses the year under way while it is the only one', () => {
    expect(yearlyAverage([{ endYear: 2026, minutes: 90 * 60 }], 2026)).toEqual({
      averageMinutes: 90 * 60,
      years: 1,
      currentOnly: true,
    })
    expect(yearlyAverage([{ endYear: 2026, minutes: 0 }], 2026)).toBeNull()
  })
})
