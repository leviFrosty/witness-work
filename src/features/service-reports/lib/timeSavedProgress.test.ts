import { beforeAll, describe, expect, it, vi } from 'vitest'

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
import { timeSavedProgress } from '@/features/service-reports/lib/timeSavedProgress'

const october = { year: 2026, month: 9 }
const base = {
  addedMinutes: 90,
  beforeMinutes: 645,
  afterMinutes: 735,
  goalMinutes: 50 * 60,
  period: 'month' as const,
  entryMonth: october,
  today: october,
  format: 'short' as const,
}
const yearly = {
  ...base,
  beforeMinutes: 7200,
  afterMinutes: 7290,
  goalMinutes: 600 * 60,
  period: 'serviceYear' as const,
}

describe('timeSavedProgress', () => {
  beforeAll(() => {
    _i18n.locale = 'en-us'
  })

  it("shows this month's total against its goal", () => {
    expect(timeSavedProgress(base)).toEqual({
      added: '1 Hr 30 Mins added',
      progress: '12 Hrs 15 Mins of 50 Hrs',
    })
  })

  it("follows the User's Duration Format", () => {
    expect(timeSavedProgress({ ...base, format: 'decimal' })).toEqual({
      added: '1.5 Hrs added',
      progress: '12.2 Hrs of 50 Hrs',
    })
  })

  it('never shows the goal as met before it is', () => {
    const almost = { ...base, beforeMinutes: 2907, afterMinutes: 2997 }
    expect(timeSavedProgress(almost).progress).toBe('49 Hrs 57 Mins of 50 Hrs')
    expect(timeSavedProgress({ ...almost, format: 'decimal' }).progress).toBe(
      '49.9 Hrs of 50 Hrs'
    )
    expect(
      timeSavedProgress({
        ...yearly,
        beforeMinutes: 35907,
        afterMinutes: 35997,
        format: 'decimal',
      }).progress
    ).toBe('599.9 Hrs of 600 Hrs')
  })

  it('says the monthly goal was reached when the save crosses it', () => {
    expect(
      timeSavedProgress({ ...base, beforeMinutes: 2950, afterMinutes: 3040 })
        .progress
    ).toBe('Monthly goal reached')
  })

  it('keeps counting once the goal was already met', () => {
    expect(
      timeSavedProgress({ ...base, beforeMinutes: 3000, afterMinutes: 3090 })
        .progress
    ).toBe('51 Hrs 30 Mins of 50 Hrs')
  })

  it("shows only the month's total without a goal", () => {
    expect(timeSavedProgress({ ...base, goalMinutes: 0 }).progress).toBe(
      '12 Hrs 15 Mins this month'
    )
    expect(
      timeSavedProgress({
        ...base,
        goalMinutes: 0,
        entryMonth: { year: 2026, month: 8 },
      }).progress
    ).toBe('12 Hrs 15 Mins in Sep')
  })

  it('names an earlier month', () => {
    expect(
      timeSavedProgress({ ...base, entryMonth: { year: 2026, month: 8 } })
        .progress
    ).toBe('12 Hrs 15 Mins of 50 Hrs in Sep')
    expect(
      timeSavedProgress({ ...base, entryMonth: { year: 2025, month: 11 } })
        .progress
    ).toBe('12 Hrs 15 Mins of 50 Hrs in Dec 2025')
  })

  it('counts toward the Annual Goal over the Service Year', () => {
    expect(timeSavedProgress(yearly).progress).toBe(
      '121 Hrs 30 Mins of 600 Hrs'
    )
    expect(
      timeSavedProgress({
        ...yearly,
        beforeMinutes: 35950,
        afterMinutes: 36040,
      }).progress
    ).toBe('Annual goal reached')
  })

  it('names an earlier Service Year', () => {
    expect(
      timeSavedProgress({ ...yearly, entryMonth: { year: 2026, month: 7 } })
        .progress
    ).toBe('121 Hrs 30 Mins of 600 Hrs in 2025–2026')
  })

  it('keeps the current period within a short toast line', () => {
    const lines = (['short', 'decimal'] as const).flatMap((format) =>
      [
        timeSavedProgress({ ...base, format, addedMinutes: 659 }),
        timeSavedProgress({
          ...base,
          format,
          afterMinutes: 5999,
          goalMinutes: 6000,
        }),
        timeSavedProgress({ ...yearly, format, afterMinutes: 35999 }),
        timeSavedProgress({
          ...base,
          format,
          goalMinutes: 0,
          afterMinutes: 5999,
        }),
      ].flatMap(({ added, progress }) => [added, progress])
    )
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(26)
  })
})
