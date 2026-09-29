import { describe, expect, it } from 'vitest'

import { monthEditTargets } from '@/features/service-reports/lib/monthEditTargets'

const now = new Date(2026, 8, 15)

describe('monthEditTargets', () => {
  it('allows status changes for started months only', () => {
    expect(
      monthEditTargets({ month: 8, year: 2026, baseGoalHours: 0, now }).status
    ).toBe(true)
    expect(
      monthEditTargets({ month: 11, year: 2025, baseGoalHours: 0, now }).status
    ).toBe(true)
    expect(
      monthEditTargets({ month: 9, year: 2026, baseGoalHours: 0, now }).status
    ).toBe(false)
  })

  it('allows goal changes only when the month has a Monthly Goal', () => {
    expect(
      monthEditTargets({ month: 8, year: 2026, baseGoalHours: 50, now }).goal
    ).toBe(true)
    expect(
      monthEditTargets({ month: 8, year: 2026, baseGoalHours: 0, now }).goal
    ).toBe(false)
  })
})
