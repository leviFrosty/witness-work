import { describe, it, expect, beforeAll, vi } from 'vitest'
import fc from 'fast-check'

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios' },
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ timeZone: 'UTC' }],
}))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))

import { _i18n } from '@/lib/locales'
import {
  formatMinutes,
  formatMinutesCompact,
  formatMinutesSpoken,
  formatSecondsSpoken,
} from '@/lib/minutes'

const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined
const runs = { numRuns: 500, seed }

const nonNegativeMinutes = fc.oneof(
  fc.double({ min: 0, max: 100_000, noNaN: true }),
  fc.nat({ max: 100_000_000 }).map((thousandths) => thousandths / 1000),
  fc
    .tuple(fc.nat({ max: 1_000 }), fc.double({ min: 0.5, max: 1, noNaN: true }))
    .map(([hours, under]) => hours * 60 + 59 + under)
)

describe('Duration Format (src/lib/minutes.ts)', () => {
  beforeAll(() => {
    _i18n.locale = 'en-us'
  })

  describe('formatMinutes — full, preference-aware', () => {
    it.each<[number, 'decimal' | 'short', string]>([
      [0, 'decimal', '0 Hrs'],
      [0, 'short', '0 Hrs 0 Mins'],
      [60, 'decimal', '1 Hr'],
      [60, 'short', '1 Hr 0 Mins'],
      [90, 'decimal', '1.5 Hrs'],
      [90, 'short', '1 Hr 30 Mins'],
      [125, 'decimal', '2.1 Hrs'],
      [125, 'short', '2 Hrs 5 Mins'],
    ])('formats %d min as %s → "%s"', (minutes, format, expected) => {
      expect(formatMinutes(minutes, format).formatted).toBe(expected)
    })

    it.each<[number, string]>([
      [59.6, '1 Hr 0 Mins'],
      [119.7, '2 Hrs 0 Mins'],
      [59.4, '0 Hrs 59 Mins'],
      [90.5, '1 Hr 31 Mins'],
    ])(
      'rounds fractional %d min to a whole minute → "%s"',
      (minutes, expected) => {
        expect(formatMinutes(minutes, 'short').formatted).toBe(expected)
      }
    )

    it('never renders a short minutes component outside 0–59', () => {
      fc.assert(
        fc.property(nonNegativeMinutes, (total) => {
          const { hours, minutes } = formatMinutes(total, 'short')
          expect(minutes).toBeGreaterThanOrEqual(0)
          expect(minutes).toBeLessThanOrEqual(59)
          expect(Number.isInteger(minutes)).toBe(true)
          expect(hours * 60 + minutes).toBe(Math.round(total))
        }),
        runs
      )
    })

    it.each<[number, 'decimal' | 'short', string]>([
      [-30, 'short', '−0 Hrs 30 Mins'],
      [-30, 'decimal', '−0.5 Hrs'],
      [-90, 'short', '−1 Hr 30 Mins'],
      [-60, 'decimal', '−1 Hr'],
    ])(
      'formats a negative %d min by its magnitude as %s → "%s"',
      (minutes, format, expected) => {
        expect(formatMinutes(minutes, format).formatted).toBe(expected)
      }
    )

    it('mirrors a positive duration for its negative', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100_000 }),
          fc.constantFrom('decimal' as const, 'short' as const),
          (total, format) => {
            const positive = formatMinutes(total, format)
            const negative = formatMinutes(-total, format)
            expect(negative.formatted).toBe(`−${positive.formatted}`)
            expect(negative.hours).toBe(
              positive.hours === 0 ? 0 : -positive.hours
            )
            expect(negative.minutes).toBe(
              positive.minutes === 0 ? 0 : -positive.minutes
            )
            expect(negative.hours * 60 + negative.minutes).toBe(-total)
          }
        ),
        runs
      )
    })

    it.each<[number, string]>([
      [59.97, '1 Hr'],
      [92.99, '1.6 Hrs'],
    ])(
      'decimal rounds fractional %d min to a whole minute first → "%s"',
      (minutes, expected) => {
        expect(formatMinutes(minutes, 'decimal').formatted).toBe(expected)
      }
    )

    it('renders a fractional duration exactly like its nearest whole minute', () => {
      fc.assert(
        fc.property(
          nonNegativeMinutes,
          fc.constantFrom('decimal' as const, 'short' as const),
          (total, format) => {
            expect(formatMinutes(total, format)).toEqual(
              formatMinutes(Math.round(total), format)
            )
          }
        ),
        runs
      )
    })

    it('exposes the raw breakdown', () => {
      expect(formatMinutes(125, 'short')).toMatchObject({
        hours: 2,
        minutes: 5,
        decimalHours: 2.1,
      })
    })
  })

  describe('formatMinutesCompact — ultra-compact', () => {
    it.each<[number, string]>([
      [0, ''],
      [30, '30m'],
      [60, '1h'],
      [90, '1.5h'],
      [120, '2h'],
      [150, '2.5h'],
      [630, '10.5h'],
      [690, '11.5h'],
      [720, '12h'],
    ])('formats %d min compactly → "%s"', (minutes, expected) => {
      expect(formatMinutesCompact(minutes)).toBe(expected)
    })

    it.each<[number, string]>([
      [29.6, '30m'],
      [59.6, '1h'],
      [119.7, '2h'],
      [90.4, '1.5h'],
    ])(
      'rounds fractional %d min to a whole minute → "%s"',
      (minutes, expected) => {
        expect(formatMinutesCompact(minutes)).toBe(expected)
      }
    )

    it('renders a fractional duration exactly like its nearest whole minute', () => {
      fc.assert(
        fc.property(nonNegativeMinutes, (total) => {
          expect(formatMinutesCompact(total)).toBe(
            formatMinutesCompact(Math.round(total))
          )
        }),
        runs
      )
    })

    it('renders an explicit hours unit verbatim (absorbs former formatHoursCompact)', () => {
      expect(formatMinutesCompact(2, { unit: 'hours' })).toBe('2h')

      expect(formatMinutesCompact(0, { unit: 'hours' })).toBe('0h')
    })
  })

  describe('formatMinutesSpoken — screen-reader words', () => {
    it.each<[number, string]>([
      [0, '0 hours'],
      [1, '1 minute'],
      [30, '30 minutes'],
      [60, '1 hour'],
      [61, '1 hour 1 minute'],
      [390, '6 hours 30 minutes'],
      [3000, '50 hours'],
      [59.6, '1 hour'],
      [-90, '−1 hour 30 minutes'],
    ])('speaks %d min as "%s"', (minutes, expected) => {
      expect(formatMinutesSpoken(minutes)).toBe(expected)
    })

    it('never uses the on-screen abbreviations', () => {
      fc.assert(
        fc.property(nonNegativeMinutes, (total) => {
          expect(formatMinutesSpoken(total)).toMatch(
            /^\d+ (hours?|minutes?)( \d+ minutes?)?$/
          )
        }),
        runs
      )
    })
  })

  describe('formatSecondsSpoken — a running timer', () => {
    it.each<[number, string]>([
      [0, '0 seconds'],
      [1, '1 second'],
      [59.9, '59 seconds'],
      [725, '12 minutes 5 seconds'],
      [3600, '1 hour'],
      [3725, '1 hour 2 minutes 5 seconds'],
    ])('speaks %d s as "%s"', (seconds, expected) => {
      expect(formatSecondsSpoken(seconds)).toBe(expected)
    })
  })
})
