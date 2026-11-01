import { describe, expect, it } from 'vitest'
import { activeMonths, petActiveDays } from '@/features/pet/lib/activity'
import type { TimeEntry } from '@/types/timeEntry'

const anchored = (key: string) => new Date(`${key}T12:00:00.000Z`)
const entry = (id: string, key: string, extra: Partial<TimeEntry> = {}) =>
  ({ id, date: anchored(key), hours: 1, minutes: 0, ...extra }) as TimeEntry

describe('petActiveDays', () => {
  it('counts time entries (0-minute too) but not rollovers', () => {
    const days = petActiveDays({
      serviceReports: {
        2026: {
          2: [
            entry('a', '2026-03-02'),
            entry('b', '2026-03-03', { hours: 0, minutes: 0 }),
            entry('c', '2026-03-31', {
              rollover: true,
              hours: 0,
              minutes: -30,
            }),
          ],
          3: [
            entry('d', '2026-04-01', { rollover: true, hours: 0, minutes: 30 }),
          ],
        },
      },
      visits: [],
      dayPlans: [],
      recurringPlans: [],
    })
    expect([...days].sort()).toEqual(['2026-03-02', '2026-03-03'])
  })

  it('counts visits on their local day and plans on the day the User saved them', () => {
    const days = petActiveDays({
      serviceReports: {},
      visits: [{ date: new Date(2026, 2, 4, 23, 30) }],
      dayPlans: [
        { savedOn: '2026-03-05' },

        { savedOn: undefined },
        { savedOn: 'yesterday' },
      ],
      recurringPlans: [{ savedOn: '2026-03-06' }],
    })
    expect([...days].sort()).toEqual(['2026-03-04', '2026-03-05', '2026-03-06'])
  })

  it('reads stored dates as strings or Dates, anchored or not', () => {
    const days = petActiveDays({
      serviceReports: {
        2026: {
          2: [
            {
              ...entry('a', '2026-03-02'),
              date: '2026-03-02T12:00:00.000Z' as unknown as Date,
            },
            {
              ...entry('b', '2026-03-09'),
              date: '2026-03-09T12:00:00Z' as unknown as Date,
            },

            { ...entry('c', '2026-03-10'), date: new Date(2026, 2, 10, 22) },
          ],
        },
      },
      visits: [],
      dayPlans: [],
      recurringPlans: [],
    })
    expect([...days].sort()).toEqual(['2026-03-02', '2026-03-09', '2026-03-10'])
  })

  it("skips visits that came with a shared Contact (the sender's ministry)", () => {
    const days = petActiveDays({
      serviceReports: {},
      visits: [
        { date: new Date(2026, 5, 1, 9), receivedAt: 1 },
        { date: new Date(2026, 5, 2, 9) },
      ],
      dayPlans: [],
      recurringPlans: [],
    })
    expect([...days]).toEqual(['2026-06-02'])
  })

  it('reads visit dates that came back from storage as strings', () => {
    const at = new Date(2026, 5, 1, 9)
    const days = petActiveDays({
      serviceReports: {},
      visits: [
        { date: at.toISOString() as unknown as Date },
        { date: 'garbage' as unknown as Date },
      ],
      dayPlans: [],
      recurringPlans: [],
    })
    expect([...days]).toEqual(['2026-06-01'])
  })
})

describe('activeMonths', () => {
  it('counts months with an active day since adoption', () => {
    const days = [
      '2026-01-31',
      '2026-02-01',
      '2026-02-20',
      '2026-04-03',
      '2026-06-01',
    ]
    expect(activeMonths(days, '2026-02-01')).toBe(3)
    expect(activeMonths(days, '2026-02-01', '2026-04-30')).toBe(2)
    expect(activeMonths(days, '2027-01-01')).toBe(0)
  })
})
