import moment from 'moment'
import { describe, expect, it, vi } from 'vitest'

// The real formatters reach expo-localization.
vi.mock('@/lib/dates', () => ({
  formatTime: () => '7:30 PM',
  formatWeekdayMonthDayCompact: (m: moment.Moment) => m.format('ddd, MMM D'),
  formatDate: (m: moment.Moment) => m.format('MMM D, YYYY'),
}))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: Record<string, unknown>) =>
      options === undefined
        ? key
        : `${key}:${Object.values(options).join('|')}`,
  },
}))

const { dayPhrase, distancePhrase, whenPhrase } = await import(
  '@/lib/dayPhrases'
)

// A Thursday.
const NOW = new Date('2026-10-08T15:00:00').getTime()

describe('dayPhrase', () => {
  // NOW is Thursday, Oct 8.
  const at = (date: string) => dayPhrase(new Date(date), NOW)

  it('names nearby days in words', () => {
    expect(at('2026-10-08T19:30:00')).toBe('dayPhrase_today')
    expect(at('2026-10-09T09:00:00')).toBe('dayPhrase_tomorrow')
    expect(at('2026-10-07T09:00:00')).toBe('dayPhrase_yesterday')
  })

  it('uses the weekday within a week either way', () => {
    expect(at('2026-10-10T19:30:00')).toBe('Saturday')
    expect(at('2026-10-04T10:00:00')).toBe('Sunday')
  })

  it('uses the date beyond that, with the year when it differs', () => {
    expect(at('2026-10-30T19:30:00')).toBe('Fri, Oct 30')
    expect(at('2027-01-05T19:30:00')).toBe('Jan 5, 2027')
  })

  it('pairs the day with the time', () => {
    expect(whenPhrase(new Date('2026-10-10T19:30:00'), NOW)).toBe(
      'dayPhrase_atTime:Saturday|7:30 PM'
    )
  })
})

describe('distancePhrase', () => {
  it('counts hours on the same day and calendar days otherwise', () => {
    expect(distancePhrase(new Date('2026-10-08T18:00:00'), NOW)).toBe(
      'in 3 hours'
    )
    // 52 hours away, but the day after tomorrow.
    expect(
      distancePhrase(
        new Date('2026-10-10T19:30:00'),
        new Date('2026-10-08T15:30:00').getTime()
      )
    ).toBe('in 2 days')
    expect(distancePhrase(new Date('2026-10-07T23:00:00'), NOW)).toBe(
      'a day ago'
    )
  })
})
