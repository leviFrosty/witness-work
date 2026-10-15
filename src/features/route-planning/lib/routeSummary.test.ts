import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  const i18n = new I18n({ en }, { locale: 'en' })
  return { default: i18n, _i18n: i18n }
})
vi.mock('@/stores/preferences', () => ({
  usePreferences: { getState: () => ({}) },
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ regionCode: 'US' }],
  getCalendars: () => [],
}))

import { formatRouteSummary } from '@/features/route-planning/lib/routeSummary'

const METERS_PER_MILE = 1609.344

describe('formatRouteSummary', () => {
  it('reads one hour and one mile in the singular', () => {
    expect(
      formatRouteSummary(
        { distanceMeters: METERS_PER_MILE, durationSeconds: 60 * 60 },
        { timeDisplayFormat: 'decimal', distanceUnit: 'mi' }
      )
    ).toBe('1 Hr · 1 mi')
  })

  it('reads longer routes in the plural, in the chosen unit', () => {
    expect(
      formatRouteSummary(
        { distanceMeters: 18_200, durationSeconds: 2 * 60 * 60 },
        { timeDisplayFormat: 'decimal', distanceUnit: 'km' }
      )
    ).toBe('2 Hrs · 18.2 km')
    expect(
      formatRouteSummary(
        { distanceMeters: 18.2 * METERS_PER_MILE, durationSeconds: 90 * 60 },
        { timeDisplayFormat: 'decimal', distanceUnit: 'mi' }
      )
    ).toBe('1.5 Hrs · 18.2 mi')
  })
})
