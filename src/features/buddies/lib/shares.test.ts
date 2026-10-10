import { describe, expect, it } from 'vitest'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import type { DayPlan } from '@/types/timeEntry'
import { planEndsAt, planShareDetails } from '@/features/buddies/lib/shares'

const plan: DayPlan = {
  id: 'anytime',
  date: normalizeDateForStorage(new Date(2026, 2, 10, 12)),
  minutes: 300,
  startTimeInMinutes: 720,
  anytime: true,
}

describe('sharing an anytime Plan', () => {
  it('sends no start time, so buddies on any version see no time', () => {
    expect(planShareDetails(plan)).not.toHaveProperty('s')
    expect(planShareDetails({ ...plan, anytime: undefined }).s).toBe(720)
  })

  it('lasts the whole day', () => {
    expect(planEndsAt(plan)).toBe(new Date(2026, 2, 11).getTime())
  })
})
