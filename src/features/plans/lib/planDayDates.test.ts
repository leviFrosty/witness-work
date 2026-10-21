import { describe, expect, it } from 'vitest'
import { dayToPlan } from '@/features/plans/lib/planDayDates'

describe('dayToPlan', () => {
  it('plans today before 6 PM', () => {
    expect(dayToPlan(new Date(2026, 9, 20, 9, 0)).getDate()).toBe(20)
    expect(dayToPlan(new Date(2026, 9, 20, 17, 59)).getDate()).toBe(20)
  })

  it('plans tomorrow from 6 PM', () => {
    expect(dayToPlan(new Date(2026, 9, 20, 18, 0)).getDate()).toBe(21)
    expect(dayToPlan(new Date(2026, 9, 20, 23, 30)).getDate()).toBe(21)
  })

  it('rolls over the end of the month', () => {
    const planned = dayToPlan(new Date(2026, 9, 31, 21, 0))
    expect([planned.getMonth(), planned.getDate()]).toEqual([10, 1])
  })
})
