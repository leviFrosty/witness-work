import { describe, it, expect, beforeAll, vi } from 'vitest'

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
vi.mock('expo-device', () => ({ DeviceType: { TABLET: 2 }, deviceType: 1 }))
vi.mock('@/shaders/registry', () => ({ DEFAULT_SHADER_ID: 'holographic' }))

import { _i18n } from '@/lib/locales'
import { formatMinutes, formatMinutesCompact } from '@/lib/minutes'

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

    it('renders an explicit hours unit verbatim (absorbs former formatHoursCompact)', () => {
      expect(formatMinutesCompact(2, { unit: 'hours' })).toBe('2h')
      // Unlike the minutes path, the hours path always emits a token for zero.
      expect(formatMinutesCompact(0, { unit: 'hours' })).toBe('0h')
    })
  })
})
