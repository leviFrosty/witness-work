import { afterEach, describe, expect, it } from 'vitest'
import {
  addDays,
  dayKeyFromNumber,
  dayNumber,
  daysBetween,
  isDayKey,
  localDayKey,
  recordDayKey,
} from '@/features/pet/lib/dayKeys'
import { storedDayKey } from '@/lib/normalizeDate'
import moment from 'moment'

const originalTZ = process.env.TZ

describe('day keys', () => {
  afterEach(() => {
    process.env.TZ = originalTZ
  })

  it('round-trips keys and numbers', () => {
    expect(dayNumber('1970-01-01')).toBe(0)
    expect(dayKeyFromNumber(dayNumber('2026-10-18'))).toBe('2026-10-18')
    expect(dayNumber('18/10/2026')).toBeNaN()
  })

  it('steps one day at a time through DST and leap days in any zone', () => {
    for (const zone of [
      'America/New_York',
      'Europe/London',
      'Pacific/Auckland',
    ]) {
      process.env.TZ = zone
      expect(addDays('2026-03-07', 1)).toBe('2026-03-08')
      expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
      expect(addDays('2026-10-31', 2)).toBe('2026-11-02')
      expect(addDays('2026-04-04', 2)).toBe('2026-04-06')
      expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
      expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365)
      expect(daysBetween('2026-03-09', '2026-03-01')).toBe(-8)
    }
  })

  it('names the local day of a moment', () => {
    process.env.TZ = 'Pacific/Auckland'

    expect(localDayKey(Date.UTC(2026, 9, 17, 11, 30))).toBe('2026-10-18')
    process.env.TZ = 'America/Los_Angeles'
    expect(localDayKey(Date.UTC(2026, 9, 18, 3, 0))).toBe('2026-10-17')
  })

  it('names the local day without moment, as moment would', () => {
    for (const zone of [
      'Pacific/Auckland',
      'America/Los_Angeles',
      'Asia/Kolkata',
    ]) {
      process.env.TZ = zone
      for (const ms of [
        0,
        Date.UTC(2026, 2, 8, 9, 59),
        Date.UTC(2026, 9, 18, 23),
      ])
        expect(localDayKey(ms)).toBe(moment(ms).format('YYYY-MM-DD'))
    }
    expect(localDayKey('garbage')).toBe('Invalid date')
    expect(localDayKey(new Date(2026, 0, 5).toISOString())).toBe('2026-01-05')
  })

  it('reads stored days like storedDayKey', () => {
    process.env.TZ = 'Pacific/Auckland'
    for (const date of [
      '2026-03-02T12:00:00.000Z',
      '2026-03-02T12:00:00Z',
      new Date('2026-03-02T12:00:00.000Z'),

      new Date(2026, 2, 2, 23, 30),
      '2026-03-02T05:00:00.000Z',
    ])
      expect(recordDayKey(date)).toBe(storedDayKey(date))
  })

  it('checks keys', () => {
    expect(isDayKey('2026-02-28')).toBe(true)
    expect(isDayKey('2026-02-30')).toBe(false)
    expect(isDayKey('2026-2-3')).toBe(false)
    expect(isDayKey(20260228)).toBe(false)
  })
})
