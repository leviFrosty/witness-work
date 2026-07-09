import { describe, expect, it } from 'vitest'
import { monthlyGoalKey, resolveMonthlyGoalHours } from '@/lib/monthlyGoals'

describe('Monthly Goal resolution', () => {
  it('keys an exact zero-based calendar month as YYYY-MM', () => {
    expect(monthlyGoalKey({ year: 2026, month: 0 })).toBe('2026-01')
    expect(monthlyGoalKey({ year: 2026, month: 10 })).toBe('2026-11')
  })

  it('rejects an invalid calendar month', () => {
    expect(() => monthlyGoalKey({ year: 2026, month: -1 })).toThrow(RangeError)
    expect(() => monthlyGoalKey({ year: 2026, month: 12 })).toThrow(RangeError)
    expect(() => monthlyGoalKey({ year: 2026, month: 1.5 })).toThrow(RangeError)
  })

  it('resolves the exact month override and otherwise uses the base goal', () => {
    const overrides = { '2026-11': 60.5 }

    expect(
      resolveMonthlyGoalHours(50, overrides, { year: 2026, month: 10 })
    ).toBe(60.5)
    expect(
      resolveMonthlyGoalHours(50, overrides, { year: 2026, month: 9 })
    ).toBe(50)
    expect(
      resolveMonthlyGoalHours(50, overrides, { year: 2027, month: 10 })
    ).toBe(50)
  })

  it('supports a zero-hour override and ignores malformed persisted goals', () => {
    expect(
      resolveMonthlyGoalHours(50, { '2026-11': 0 }, { year: 2026, month: 10 })
    ).toBe(0)
    expect(
      resolveMonthlyGoalHours(
        50,
        { '2026-11': Number.NaN },
        { year: 2026, month: 10 }
      )
    ).toBe(50)
    expect(
      resolveMonthlyGoalHours(50, { '2026-11': -1 }, { year: 2026, month: 10 })
    ).toBe(50)
  })
})
