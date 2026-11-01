import moment from 'moment'
import { describe, expect, it } from 'vitest'
import {
  getServiceYearFromDate,
  isInServiceYear,
  serviceYearBounds,
  serviceYearMonthIndex,
  serviceYearOf,
} from '@/lib/serviceYear'

const cases = [
  { label: 'Aug 31', date: [2025, 7, 31], serviceYear: 2024, index: 11 },
  { label: 'Sep 1', date: [2025, 8, 1], serviceYear: 2025, index: 0 },
  { label: 'Dec 31', date: [2025, 11, 31], serviceYear: 2025, index: 3 },
  { label: 'Jan 1', date: [2026, 0, 1], serviceYear: 2025, index: 4 },
] as const

describe('serviceYear helpers', () => {
  it.each(cases)('serviceYearOf: $label', ({ date, serviceYear }) => {
    expect(serviceYearOf({ year: date[0], month: date[1] })).toBe(serviceYear)
  })

  it.each(cases)('getServiceYearFromDate: $label', ({ date, serviceYear }) => {
    const [y, m, d] = date
    expect(getServiceYearFromDate(new Date(y, m, d))).toBe(serviceYear)
    expect(getServiceYearFromDate(moment({ y, M: m, d }))).toBe(serviceYear)
  })

  it.each(cases)('isInServiceYear: $label', ({ date, serviceYear }) => {
    const day = new Date(date[0], date[1], date[2])
    expect(isInServiceYear(day, serviceYear)).toBe(true)
    expect(isInServiceYear(day, serviceYear - 1)).toBe(false)
    expect(isInServiceYear(day, serviceYear + 1)).toBe(false)
  })

  it.each(cases)('serviceYearBounds: $label', ({ date, serviceYear }) => {
    const day = moment({ y: date[0], M: date[1], d: date[2], h: 12 })
    const { start, end } = serviceYearBounds(serviceYear)
    expect(day.isBetween(start, end, undefined, '[]')).toBe(true)
    const next = serviceYearBounds(serviceYear + 1)
    expect(day.isBetween(next.start, next.end, undefined, '[]')).toBe(false)
  })

  it.each(cases)(
    'serviceYearMonthIndex: $label',
    ({ date, serviceYear, index }) => {
      const month = { year: date[0], month: date[1] }
      expect(serviceYearMonthIndex(month, serviceYear)).toBe(index)

      expect(serviceYearMonthIndex(month, serviceYear + 1)).toBe(index - 12)
      expect(serviceYearMonthIndex(month, serviceYear - 1)).toBe(index + 12)
    }
  )

  it('serviceYearBounds spans Sep 1 00:00 to Aug 31 end of day, local', () => {
    const { start, end } = serviceYearBounds(2025)
    expect(start.format('YYYY-MM-DD HH:mm:ss.SSS')).toBe(
      '2025-09-01 00:00:00.000'
    )
    expect(end.format('YYYY-MM-DD HH:mm:ss.SSS')).toBe(
      '2026-08-31 23:59:59.999'
    )
  })
})
