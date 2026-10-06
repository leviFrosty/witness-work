import { describe, expect, it } from 'vitest'
import {
  monthWeeks,
  otherWeekdays,
  orderedWeekdays,
  planTargetMonth,
} from '@/features/onboarding/lib/planMonth'

describe('planTargetMonth', () => {
  it('plans this month while a week or more is left', () => {
    expect(planTargetMonth(new Date(2026, 9, 5))).toEqual({
      year: 2026,
      month: 9,
    })
    // Oct 25 → 7 days left, counting today.
    expect(planTargetMonth(new Date(2026, 9, 25))).toEqual({
      year: 2026,
      month: 9,
    })
  })

  it('plans next month in the last few days', () => {
    expect(planTargetMonth(new Date(2026, 9, 26))).toEqual({
      year: 2026,
      month: 10,
    })
  })

  it('rolls over into the next year', () => {
    expect(planTargetMonth(new Date(2026, 11, 30))).toEqual({
      year: 2027,
      month: 0,
    })
  })
})

describe('otherWeekdays', () => {
  it('returns every weekday not given', () => {
    expect(otherWeekdays([1, 3, 6])).toEqual([0, 2, 4, 5])
  })

  it('returns nothing when every day is given', () => {
    expect(otherWeekdays([0, 1, 2, 3, 4, 5, 6])).toEqual([])
  })
})

describe('orderedWeekdays', () => {
  it('starts on the Start of Week', () => {
    expect(orderedWeekdays(0)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(orderedWeekdays(1)).toEqual([1, 2, 3, 4, 5, 6, 0])
  })
})

describe('monthWeeks', () => {
  it('pads the first and last weeks to seven cells', () => {
    // October 2026 starts on a Thursday.
    const weeks = monthWeeks({ year: 2026, month: 9 }, 0, new Date(2026, 9, 5))
    expect(weeks.every((week) => week.length === 7)).toBe(true)
    expect(weeks[0].slice(0, 4)).toEqual([null, null, null, null])
    expect(weeks[0][4]).toEqual({ day: 1, weekday: 4, isPast: true })
    const cells = weeks.flat().filter((cell) => cell !== null)
    expect(cells).toHaveLength(31)
  })

  it('marks only days before today as past', () => {
    const cells = monthWeeks({ year: 2026, month: 9 }, 1, new Date(2026, 9, 5))
      .flat()
      .filter((cell) => cell !== null)
    expect(cells.filter((cell) => cell.isPast).map((cell) => cell.day)).toEqual(
      [1, 2, 3, 4]
    )
  })

  it('aligns to a Monday Start of Week', () => {
    const weeks = monthWeeks({ year: 2026, month: 9 }, 1, new Date(2026, 9, 5))
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null])
    expect(weeks[0][3]?.day).toBe(1)
  })
})
