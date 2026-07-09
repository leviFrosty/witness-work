import { describe, expect, it } from 'vitest'

import { didCrossMonthlyGoal } from '@/features/service-reports/lib/monthlyGoalCelebration'
import { monthlyGoalKey } from '@/lib/monthlyGoals'

const target = { year: 2026, month: 6 }

describe('Monthly Goal crossing', () => {
  it('uses the goal override belonging to the Time Entry month', () => {
    const monthlyGoalOverrides = {
      [monthlyGoalKey(target)]: 60,
      [monthlyGoalKey({ year: 2026, month: 7 })]: 40,
    }

    expect(
      didCrossMonthlyGoal({
        beforeMinutes: 49 * 60,
        afterMinutes: 55 * 60,
        baseGoalHours: 50,
        monthlyGoalOverrides,
        target,
      })
    ).toBe(false)

    expect(
      didCrossMonthlyGoal({
        beforeMinutes: 59 * 60,
        afterMinutes: 60 * 60,
        baseGoalHours: 50,
        monthlyGoalOverrides,
        target,
      })
    ).toBe(true)
  })

  it('does not repeat the crossing after the effective goal was already met', () => {
    expect(
      didCrossMonthlyGoal({
        beforeMinutes: 60 * 60,
        afterMinutes: 61 * 60,
        baseGoalHours: 50,
        monthlyGoalOverrides: { [monthlyGoalKey(target)]: 60 },
        target,
      })
    ).toBe(false)
  })
})
