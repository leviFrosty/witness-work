import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
  getCalendars: () => [{ uses24hourClock: false, firstWeekday: 1 }],
}))
vi.mock('react-native-calendars', () => ({
  LocaleConfig: { locales: {}, defaultLocale: '' },
}))

import { usePreferences } from '@/stores/preferences'
import usePublisher from '@/hooks/usePublisher'
import useStartOfWeek from '@/hooks/useStartOfWeek'
import { useFormattedMinutes } from '@/lib/minutes'
import useUserLocalePrefs from '@/features/settings/hooks/useLocale'

let renders = 0
// The preference reads App and Home make on every launch.
const Harness = () => {
  renders++
  usePreferences((s) => s.colorScheme)
  useUserLocalePrefs()
  usePublisher()
  useStartOfWeek()
  useFormattedMinutes(90)
  return null
}

let renderer: ReactTestRenderer | undefined
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

it("doesn't re-render the app's root hooks for bookkeeping writes", async () => {
  await act(async () => {
    renderer = create(<Harness />)
  })
  const settled = renders

  await act(async () => {
    usePreferences.getState().set({ lastiCloudSyncAt: Date.now() })
    usePreferences.getState().set({ lastiCloudPulledAt: Date.now() })
  })
  expect(renders).toBe(settled)

  await act(async () => {
    usePreferences.getState().set({ colorScheme: 'dark' })
  })
  expect(renders).toBeGreaterThan(settled)
})
