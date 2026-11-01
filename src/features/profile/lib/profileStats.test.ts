import { describe, expect, it } from 'vitest'
import {
  busiestWeekday,
  ContributionCell,
  contributionColumnAt,
  contributionGrid,
  contributionMonthLabels,
  contributionSummary,
  fittingMonthLabels,
} from '@/features/profile/lib/profileStats'

const now = new Date(2026, 9, 7, 12)
const SUNDAY = 0
const TUESDAY = 2
const SATURDAY = 6

const daily = (...days: [string, number][]) => new Map(days)
const visit = (year: number, month: number, day: number) => ({
  date: new Date(year, month, day, 10),
})

describe('busiestWeekday', () => {
  it('picks the weekday with the most days of logged time', () => {
    const logged = daily(
      ['2026-10-03', 60],
      ['2026-09-26', 60],
      ['2026-09-29', 300]
    )
    expect(busiestWeekday(logged, [], now)).toBe(SATURDAY)
  })

  it('counts Visits, for publishers who only check off the month', () => {
    const visits = [visit(2026, 9, 6), visit(2026, 8, 29), visit(2026, 9, 3)]
    expect(busiestWeekday(new Map(), visits, now)).toBe(TUESDAY)
  })

  it('counts a day with both time and Visits once', () => {
    const logged = daily(['2026-10-03', 60])
    const visits = [visit(2026, 9, 3), visit(2026, 9, 3), visit(2026, 9, 6)]

    expect(busiestWeekday(logged, visits, now)).toBe(SATURDAY)
  })

  it('breaks ties by logged minutes', () => {
    const logged = daily(['2026-10-04', 30], ['2026-10-06', 90])
    expect(busiestWeekday(logged, [], now)).toBe(TUESDAY)
  })

  it('then breaks ties by the most recent day out', () => {
    const visits = [visit(2026, 9, 4), visit(2026, 9, 6), visit(2026, 9, 3)]
    expect(busiestWeekday(new Map(), visits, now)).toBe(TUESDAY)
  })

  it('ignores the 0h check-off entry and days outside the past year', () => {
    const logged = daily(
      ['2026-10-03', 0],
      ['2025-10-07', 60],
      ['2026-10-10', 60]
    )
    expect(busiestWeekday(logged, [visit(2025, 9, 7)], now)).toBeNull()
    const lastSunday = daily(['2026-10-04', 15])
    expect(busiestWeekday(lastSunday, [], now)).toBe(SUNDAY)
  })

  it('reads rehydrated Visit dates on their local day', () => {
    const rehydrated = (date: string) => ({ date: date as unknown as Date })
    const visits = [visit(2026, 9, 6), visit(2026, 8, 29), visit(2026, 9, 3)]
      .map((v) => rehydrated(v.date.toISOString()))
      .concat(rehydrated('not a date'))
    expect(busiestWeekday(new Map(), visits, now)).toBe(TUESDAY)
  })

  it('is null with no activity', () => {
    expect(busiestWeekday(new Map(), [], now)).toBeNull()
  })

  it('skips Visits that came with a shared contact', () => {
    const logged = daily(['2026-10-03', 60])

    const received = [visit(2026, 9, 6), visit(2026, 8, 29)].map((v) => ({
      ...v,
      receivedAt: 1,
    }))
    expect(busiestWeekday(logged, received, now)).toBe(SATURDAY)
    expect(busiestWeekday(new Map(), received, now)).toBeNull()
  })
})

describe('contributionSummary', () => {
  const cell = (minutes: number, future = false): ContributionCell => ({
    date: now,
    minutes,
    level: minutes > 0 ? 1 : 0,
    future,
  })

  it('counts days with service and the longest run across weeks', () => {
    const grid = [
      [0, 60, 30, 0, 0, 45, 60].map((m) => cell(m)),

      [90, 15, 0, 120, 0, 0, 0].map((m) => cell(m)),
    ]
    expect(contributionSummary(grid)).toEqual({
      daysWithService: 7,
      longestRun: 4,
    })
  })

  it('leaves out days after today', () => {
    const grid = [[cell(60), cell(60), cell(0, true), cell(0, true)]]
    expect(contributionSummary(grid)).toEqual({
      daysWithService: 2,
      longestRun: 2,
    })
  })

  it('is empty with no service logged', () => {
    expect(contributionSummary([[cell(0), cell(0)]])).toEqual({
      daysWithService: 0,
      longestRun: 0,
    })
  })
})

describe('contributionMonthLabels', () => {
  it('names each month over its first week', () => {
    const grid = contributionGrid(new Map(), 26, new Date(2026, 9, 21, 12))
    expect(contributionMonthLabels(grid)).toEqual([
      { column: 0, label: 'Apr' },
      { column: 1, label: 'May' },
      { column: 5, label: 'Jun' },
      { column: 10, label: 'Jul' },
      { column: 14, label: 'Aug' },
      { column: 19, label: 'Sep' },
      { column: 23, label: 'Oct' },
    ])
  })
})

describe('fittingMonthLabels', () => {
  const labels = [
    { column: 0, label: 'Apr' },
    { column: 1, label: 'May' },
    { column: 5, label: 'Jun' },
    { column: 9, label: 'Jul' },
  ]
  const widths = (width: number) =>
    Object.fromEntries(labels.map((l) => [l.column, width]))
  const names = (kept: { label: string }[]) => kept.map((l) => l.label)

  it('drops a one-week month that would run into the next', () => {
    expect(names(fittingMonthLabels(labels, widths(20), 14, 4))).toEqual([
      'May',
      'Jun',
      'Jul',
    ])
  })

  it('keeps every label that has room', () => {
    expect(names(fittingMonthLabels(labels, widths(9), 14, 4))).toEqual([
      'Apr',
      'May',
      'Jun',
      'Jul',
    ])
  })

  it('thins out labels wider than a month of columns', () => {
    expect(names(fittingMonthLabels(labels, widths(50), 11, 4))).toEqual([
      'May',
      'Jul',
    ])
  })

  it('drops a last label that would run past the end of the row', () => {
    expect(names(fittingMonthLabels(labels, widths(50), 14, 4, 150))).toEqual([
      'May',
      'Jun',
    ])

    expect(names(fittingMonthLabels(labels, widths(9), 14, 4, 150))).toEqual([
      'Apr',
      'May',
      'Jun',
      'Jul',
    ])
  })

  it("names the window's first month only over its own weeks", () => {
    const crowded = [
      { column: 0, label: 'Apr' },
      { column: 1, label: 'May' },
      { column: 4, label: 'Jun' },
    ]
    expect(
      names(fittingMonthLabels(crowded, { 0: 30, 1: 30, 4: 30 }, 11, 4))
    ).toEqual(['Jun'])

    const roomy = [
      { column: 0, label: 'Apr' },
      { column: 3, label: 'May' },
    ]
    expect(names(fittingMonthLabels(roomy, { 0: 20, 3: 20 }, 14, 4))).toEqual([
      'Apr',
      'May',
    ])
  })

  it('never lets a kept label reach the next one', () => {
    const kept = fittingMonthLabels(labels, widths(30), 11, 4)
    kept.slice(1).forEach((label, i) => {
      expect(kept[i].column * 11 + 30 + 4).toBeLessThanOrEqual(
        label.column * 11
      )
    })
  })
})

describe('contributionColumnAt', () => {
  const stride = 12
  const width = 34

  it('counts columns from the left edge left to right', () => {
    expect(contributionColumnAt(2, stride, width, false)).toBe(0)
    expect(contributionColumnAt(13, stride, width, false)).toBe(1)
    expect(contributionColumnAt(30, stride, width, false)).toBe(2)
  })

  it('counts columns from the right edge right to left', () => {
    expect(contributionColumnAt(32, stride, width, true)).toBe(0)
    expect(contributionColumnAt(21, stride, width, true)).toBe(1)
    expect(contributionColumnAt(4, stride, width, true)).toBe(2)
  })

  it('falls outside the grid past either edge', () => {
    expect(contributionColumnAt(-1, stride, width, false)).toBe(-1)
    expect(contributionColumnAt(width + 1, stride, width, true)).toBe(-1)
  })
})
