import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getServiceYearTotalsByEndYear } from '@/lib/serviceReport'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import type { TimeEntry } from '@/types/timeEntry'

const originalTZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'Pacific/Auckland'
})
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

let nextId = 0
const entry = (date: Date | string, hours: number, minutes = 0): TimeEntry =>
  ({ id: `e${nextId++}`, date, hours, minutes }) as TimeEntry

describe('getServiceYearTotalsByEndYear', () => {
  it('splits Service Years between August and September', () => {
    const totals = getServiceYearTotalsByEndYear([
      entry(normalizeDateForStorage(new Date(2025, 7, 31)), 2),
      entry(normalizeDateForStorage(new Date(2025, 8, 1)), 1, 30),
      entry(normalizeDateForStorage(new Date(2026, 7, 31)), 0, 15),
    ])

    expect(Object.fromEntries(totals)).toEqual({
      2025: { minutes: 120, reportCount: 1 },
      2026: { minutes: 105, reportCount: 2 },
    })
  })

  it('counts zero-hour placeholders as entries', () => {
    const totals = getServiceYearTotalsByEndYear([
      entry(normalizeDateForStorage(new Date(2024, 0, 10)), 0),
    ])

    expect(totals.get(2024)).toEqual({ minutes: 0, reportCount: 1 })
    expect(totals.has(2025)).toBe(false)
  })

  it('reads rehydrated and unanchored dates on their stored calendar day', () => {
    const totals = getServiceYearTotalsByEndYear([
      entry('2025-09-01T12:00:00.000Z', 1),

      entry(new Date(2025, 8, 1, 9), 2),
    ])

    expect(Object.fromEntries(totals)).toEqual({
      2026: { minutes: 180, reportCount: 2 },
    })
  })
})
