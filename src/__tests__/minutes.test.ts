import { describe, it, expect, beforeAll, vi } from 'vitest'
import fc from 'fast-check'

// The Duration Format module pulls in @/lib/locales → @/stores/mmkv, which
// reaches for native MMKV / AsyncStorage. Stub those the same way the rest of
// the suite does so the pure formatting logic can run under node.
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
import { formatMinutes, formatMinutesCompact } from '@/lib/minutes'

// Property runs print the seed on failure; rerun with
// `FC_SEED=<seed> pnpm vitest run src/__tests__/minutes.test.ts`.
const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined
const runs = { numRuns: 500, seed }

/**
 * Non-negative durations: raw doubles (which cluster near zero), realistic
 * fractional durations up to ~1,700 hours, and fractions just under an hour.
 */
const nonNegativeMinutes = fc.oneof(
  fc.double({ min: 0, max: 100_000, noNaN: true }),
  fc.nat({ max: 100_000_000 }).map((thousandths) => thousandths / 1000),
  fc
    .tuple(fc.nat({ max: 1_000 }), fc.double({ min: 0.5, max: 1, noNaN: true }))
    .map(([hours, under]) => hours * 60 + 59 + under)
)

/**
 * Byte-for-byte equivalence guard for the Duration Format module. These assert
 * the exact rendered strings (en-US) for representative durations across both
 * display formats and the compact variant, so any change to the formatting
 * pipeline is caught.
 */
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
      [630, '11h'],
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
      // Unlike the minutes path, the hours path always emits a token for zero.
      expect(formatMinutesCompact(0, { unit: 'hours' })).toBe('0h')
    })
  })
})
