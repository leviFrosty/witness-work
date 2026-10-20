vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  getDeviceTypeAsync: async () => 1,
  osName: 'iOS',
  deviceType: 1,
  DeviceType: { TABLET: 2 },
}))
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn() },
}))
vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
import { mergePreferences } from '@/app/sync/preferencesMerge'
import { NON_SYNCABLE_PREFERENCE_KEYS } from '@/lib/syncPreferencePolicy'
import { usePreferences } from '@/stores/preferences'

const STAMP = 'submittedReportMonths:2026-09'

beforeEach(() => {
  usePreferences.setState({
    submittedReportMonths: [],
    preferenceUpdatedAt: {},
  })
})

describe('unmarkReportSubmitted', () => {
  it('removes only that month and stamps the removal', () => {
    const { markReportSubmitted, unmarkReportSubmitted } =
      usePreferences.getState()
    markReportSubmitted('2026-08')
    markReportSubmitted('2026-09')
    const marked = usePreferences.getState().preferenceUpdatedAt[STAMP]
    expect(marked).toBeGreaterThan(0)

    unmarkReportSubmitted('2026-09')
    const state = usePreferences.getState()
    expect(state.submittedReportMonths).toEqual(['2026-08'])
    expect(state.preferenceUpdatedAt[STAMP]).toBeGreaterThan(marked)
  })

  it('does nothing for a month that was never marked', () => {
    usePreferences.getState().unmarkReportSubmitted('2026-09')
    expect(usePreferences.getState().preferenceUpdatedAt).toEqual({})
  })

  it('stamps a later mark again after an unmark', () => {
    const { markReportSubmitted, unmarkReportSubmitted } =
      usePreferences.getState()
    markReportSubmitted('2026-09')
    unmarkReportSubmitted('2026-09')
    const removed = usePreferences.getState().preferenceUpdatedAt[STAMP]
    markReportSubmitted('2026-09')
    expect(
      usePreferences.getState().preferenceUpdatedAt[STAMP]
    ).toBeGreaterThan(removed)
  })
})

describe('submittedReportMonths merge', () => {
  it("keeps an unmark over another device's older mark", () => {
    const merged = mergePreferences(
      { submittedReportMonths: ['2026-08'] },
      { submittedReportMonths: 300, [STAMP]: 300 },
      { submittedReportMonths: ['2026-08', '2026-09'] },
      { submittedReportMonths: 200, [STAMP]: 200 },
      NON_SYNCABLE_PREFERENCE_KEYS
    )
    expect(merged.values.submittedReportMonths).toEqual(['2026-08'])
    expect(merged.updatedAt[STAMP]).toBe(300)
  })

  it('brings back a month marked again after an older unmark', () => {
    const merged = mergePreferences(
      { submittedReportMonths: ['2026-08'] },
      { submittedReportMonths: 300, [STAMP]: 300 },
      { submittedReportMonths: ['2026-08', '2026-09'] },
      { submittedReportMonths: 400, [STAMP]: 400 },
      NON_SYNCABLE_PREFERENCE_KEYS
    )
    expect(merged.values.submittedReportMonths).toEqual(['2026-08', '2026-09'])
    expect(merged.updatedAt[STAMP]).toBe(400)
  })
})
