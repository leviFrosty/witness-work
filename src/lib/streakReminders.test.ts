import { describe, expect, it } from 'vitest'
import { reminderOccurrences } from '@/lib/reminderSchedule'
import type { ServiceStreak } from '@/lib/serviceStreak'

const base = {
  contacts: [],
  visits: [],
  plans: [],
  visitOffset: { amount: 0, unit: 'minutes' as const },
  planOffset: { amount: 0, unit: 'minutes' as const },
}

const streak = (overrides: Partial<ServiceStreak> = {}): ServiceStreak => ({
  kind: 'plans',
  count: 12,
  latest: '2026-10-03',
  due: { period: '2026-10-05', endsAt: new Date(2026, 9, 7) },
  ...overrides,
})

describe('streak reminders', () => {
  it('reminds at 6 PM on the last day to keep a shown streak', () => {
    const [reminder] = reminderOccurrences({ ...base, streak: streak() })
    expect(reminder).toEqual({
      id: 'witness-work-streak-2026-10-05',
      date: new Date(2026, 9, 6, 18),
      kind: 'streak',
      targetId: '2026-10-05',
      anchor: new Date(2026, 9, 7),
      streak: { count: 12, kind: 'plans' },
    })
  })

  it('has none while off, short of 3, or with nothing due', () => {
    expect(reminderOccurrences(base)).toEqual([])
    expect(
      reminderOccurrences({ ...base, streak: streak({ count: 2 }) })
    ).toEqual([])
    expect(
      reminderOccurrences({ ...base, streak: streak({ due: null }) })
    ).toEqual([])
  })
})
