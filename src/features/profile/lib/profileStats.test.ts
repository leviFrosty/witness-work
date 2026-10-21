import { describe, expect, it } from 'vitest'
import {
  busiestWeekday,
  ContributionCell,
  contributionSummary,
} from '@/features/profile/lib/profileStats'

// Wednesday, 2026-10-07.
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
      ['2026-10-03', 60], // Sat
      ['2026-09-26', 60], // Sat
      ['2026-09-29', 300] // Tue
    )
    expect(busiestWeekday(logged, [], now)).toBe(SATURDAY)
  })

  it('counts Visits, for publishers who only check off the month', () => {
    const visits = [visit(2026, 9, 6), visit(2026, 8, 29), visit(2026, 9, 3)]
    expect(busiestWeekday(new Map(), visits, now)).toBe(TUESDAY)
  })

  it('counts a day with both time and Visits once', () => {
    const logged = daily(['2026-10-03', 60]) // Sat
    const visits = [visit(2026, 9, 3), visit(2026, 9, 3), visit(2026, 9, 6)]
    // Tue has one day, same as Sat; Sat wins on minutes.
    expect(busiestWeekday(logged, visits, now)).toBe(SATURDAY)
  })

  it('breaks ties by logged minutes', () => {
    const logged = daily(['2026-10-04', 30], ['2026-10-06', 90])
    expect(busiestWeekday(logged, [], now)).toBe(TUESDAY)
  })

  it('then breaks ties by the most recent day out', () => {
    // A Sunday, a Tuesday and a Saturday, one Visit each; Tuesday is latest.
    const visits = [visit(2026, 9, 4), visit(2026, 9, 6), visit(2026, 9, 3)]
    expect(busiestWeekday(new Map(), visits, now)).toBe(TUESDAY)
  })

  it('ignores the 0h check-off entry and days outside the past year', () => {
    const logged = daily(
      ['2026-10-03', 0], // Sat, check-off marker
      ['2025-10-07', 60], // Tue, a year ago today
      ['2026-10-10', 60] // Sat, in the future
    )
    expect(busiestWeekday(logged, [visit(2025, 9, 7)], now)).toBeNull()
    const lastSunday = daily(['2026-10-04', 15])
    expect(busiestWeekday(lastSunday, [], now)).toBe(SUNDAY)
  })

  it('is null with no activity', () => {
    expect(busiestWeekday(new Map(), [], now)).toBeNull()
  })

  it('skips Visits that came with a shared contact', () => {
    const logged = daily(['2026-10-03', 60]) // Sat
    // The sender's Tuesdays outnumber the User's Saturday, but aren't theirs.
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
      // The run from the end of last week carries into this one.
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
