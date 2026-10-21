import { describe, expect, it } from 'vitest'
import { RecurringPlanFrequencies } from '@/types/timeEntry'

// Recurring Plans store and sync their frequency as this number. Renumbering or
// reordering the enum would silently change every saved Plan, here and on the
// User's other devices.

describe('RecurringPlanFrequencies', () => {
  it('keeps the stored value of each frequency', () => {
    expect({ ...RecurringPlanFrequencies }).toEqual({
      WEEKLY: 0,
      BI_WEEKLY: 1,
      MONTHLY: 2,
      MONTHLY_BY_WEEKDAY: 3,
      0: 'WEEKLY',
      1: 'BI_WEEKLY',
      2: 'MONTHLY',
      3: 'MONTHLY_BY_WEEKDAY',
    })
  })
})
