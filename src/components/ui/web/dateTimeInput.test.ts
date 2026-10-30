import { describe, expect, it } from 'vitest'
import {
  clockTimeOutOfRange,
  from12Hour,
  hourOutOfRange,
  fromDateInputValue,
  to12Hour,
  toDateInputValue,
  withClockTime,
} from '@/components/ui/web/dateTimeInput'

describe('date input values', () => {
  it('writes the local calendar day', () => {
    expect(toDateInputValue(new Date(2026, 9, 5, 23, 30))).toBe('2026-10-05')
  })

  it('moves a date to the typed day, keeping its clock time', () => {
    const base = new Date(2026, 9, 30, 14, 45)
    const next = fromDateInputValue(base, '2026-11-02')!
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([
      2026, 10, 2,
    ])
    expect([next.getHours(), next.getMinutes()]).toEqual([14, 45])
  })

  it('ignores an empty, half typed or impossible day', () => {
    const base = new Date(2026, 9, 30)
    expect(fromDateInputValue(base, '')).toBeNull()
    expect(fromDateInputValue(base, '2026-1')).toBeNull()
    expect(fromDateInputValue(base, '2026-02-30')).toBeNull()
  })
})

describe('clock time', () => {
  it('keeps the day when the time changes', () => {
    const next = withClockTime(new Date(2026, 9, 30, 8, 0), 17, 5)
    expect([next.getDate(), next.getHours(), next.getMinutes()]).toEqual([
      30, 17, 5,
    ])
  })

  it('converts between the 24 and 12 hour clocks', () => {
    expect(to12Hour(0)).toEqual({ hour: 12, pm: false })
    expect(to12Hour(12)).toEqual({ hour: 12, pm: true })
    expect(to12Hour(17)).toEqual({ hour: 5, pm: true })
    expect(from12Hour(12, false)).toBe(0)
    expect(from12Hour(12, true)).toBe(12)
    expect(from12Hour(5, true)).toBe(17)
  })
})

describe('time limits', () => {
  const day = new Date(2026, 9, 30, 12, 0)
  const minimum = new Date(2026, 9, 30, 9, 30)
  const maximum = new Date(2026, 9, 30, 17, 15)

  it('rules out minutes before the earliest and after the latest', () => {
    expect(clockTimeOutOfRange(day, 9, 29, minimum, maximum)).toBe(true)
    expect(clockTimeOutOfRange(day, 9, 30, minimum, maximum)).toBe(false)
    expect(clockTimeOutOfRange(day, 17, 15, minimum, maximum)).toBe(false)
    expect(clockTimeOutOfRange(day, 17, 16, minimum, maximum)).toBe(true)
    expect(clockTimeOutOfRange(day, 3, 0)).toBe(false)
  })

  it('rules out an hour only when none of its minutes fit', () => {
    expect(hourOutOfRange(day, 8, minimum, maximum)).toBe(true)
    expect(hourOutOfRange(day, 9, minimum, maximum)).toBe(false)
    expect(hourOutOfRange(day, 17, minimum, maximum)).toBe(false)
    expect(hourOutOfRange(day, 18, minimum, maximum)).toBe(true)
  })
})
