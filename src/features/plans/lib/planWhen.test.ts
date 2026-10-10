import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ uses24hourClock: false, firstWeekday: 1 }],
}))
// The real en-US template, without the store-backed i18n setup.
vi.mock('@/lib/locales', async () => {
  const { default: enUS } = await import('@/locales/en-US.json')
  return {
    default: {
      t: (key: string, options: Record<string, string>) =>
        ((enUS as Record<string, unknown>)[key] as string).replace(
          /{{(\w+)}}/g,
          (_, name: string) => options[name]
        ),
    },
  }
})

import { applyFormatRegion } from '@/lib/dates'
import { formatPlanWhen } from '@/features/plans/lib/planWhen'

// Wednesday, October 14, 2026.
const date = new Date(2026, 9, 14)

/** Reads the range with its non-breaking spaces as plain ones. */
const when = (plan: Parameters<typeof formatPlanWhen>[0]) =>
  formatPlanWhen(plan).replace(/\u00A0/g, ' ')

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 9, 12))
})

afterAll(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  applyFormatRegion({ language: 'en' })
})

describe('formatPlanWhen', () => {
  it('shows the start and end on the 12-hour clock', () => {
    expect(when({ date, startTimeInMinutes: 540, minutes: 120 })).toBe(
      'Wed, Oct 14 · 9:00 AM – 11:00 AM'
    )
  })

  it('follows a 24-hour clock', () => {
    applyFormatRegion({ language: 'en', timeFormatOverride: '24' })
    expect(when({ date, startTimeInMinutes: 540, minutes: 120 })).toBe(
      'Wed, Oct 14 · 09:00 – 11:00'
    )
  })

  it('names the next day when the Plan runs past midnight', () => {
    expect(when({ date, startTimeInMinutes: 22 * 60 + 30, minutes: 150 })).toBe(
      'Wed, Oct 14 · 10:30 PM – Thu, Oct 15 · 1:00 AM'
    )
    applyFormatRegion({ language: 'en', timeFormatOverride: '24' })
    expect(when({ date, startTimeInMinutes: 22 * 60 + 30, minutes: 150 })).toBe(
      'Wed, Oct 14 · 22:30 – Thu, Oct 15 · 01:00'
    )
  })

  it('counts ending at midnight as the next day', () => {
    expect(when({ date, startTimeInMinutes: 22 * 60, minutes: 120 })).toBe(
      'Wed, Oct 14 · 10:00 PM – Thu, Oct 15 · 12:00 AM'
    )
  })

  it('gives the year of an end in another year', () => {
    expect(
      when({
        date: new Date(2026, 11, 31),
        startTimeInMinutes: 23 * 60,
        minutes: 120,
      })
    ).toBe('Thu, Dec 31 · 11:00 PM – Jan 1, 2027 · 1:00 AM')
  })

  it('wraps a long range only at the dash', () => {
    expect(
      formatPlanWhen({ date, startTimeInMinutes: 22 * 60 + 30, minutes: 150 })
        .split(' ')
        .map((part) => part.replace(/\u00A0/g, ' '))
    ).toEqual(['Wed, Oct 14 · 10:30 PM', '–', 'Thu, Oct 15 · 1:00 AM'])
  })

  it('keeps a Plan without a start time or length as it was', () => {
    expect(when({ date, minutes: 120 })).toBe('Wed, Oct 14')
    expect(when({ date, startTimeInMinutes: 540 })).toBe(
      'Wed, Oct 14 · 9:00 AM'
    )
    expect(when({ date, startTimeInMinutes: 540, minutes: 0 })).toBe(
      'Wed, Oct 14 · 9:00 AM'
    )
  })
})
