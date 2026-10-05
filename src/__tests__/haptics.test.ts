import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
}))

const expoHaptics = vi.hoisted(() => ({
  impactAsync: vi.fn(async () => {}),
  selectionAsync: vi.fn(async () => {}),
  notificationAsync: vi.fn(async () => {}),
  performAndroidHapticsAsync: vi.fn(async () => {}),
}))
vi.mock('expo-haptics', () => ({
  ...expoHaptics,
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
  AndroidHaptics: { Long_Press: 'long-press' },
}))

import Haptics from '@/lib/haptics'
import { MmkvStorage } from '@/stores/mmkv'
import {
  NON_SYNCABLE_PREFERENCE_KEYS,
  PREFERENCE_DEFAULTS,
  usePreferences,
} from '@/stores/preferences'

describe('Haptics setting', () => {
  beforeEach(() => {
    Object.values(expoHaptics).forEach((fn) => fn.mockClear())
    usePreferences.getState().set({ hapticsEnabled: true })
  })

  it('is on by default', () => {
    expect(PREFERENCE_DEFAULTS.hapticsEnabled).toBe(true)
  })

  it('turns on for existing installs whose saved preferences predate it', async () => {
    vi.spyOn(MmkvStorage, 'getItem').mockReturnValueOnce(
      JSON.stringify({ state: { onboardingComplete: true }, version: 7 })
    )
    usePreferences.setState(usePreferences.getInitialState(), true)

    await usePreferences.persist.rehydrate()

    expect(usePreferences.getState().onboardingComplete).toBe(true)
    expect(usePreferences.getState().hapticsEnabled).toBe(true)
  })

  it('plays haptics when on', async () => {
    await Haptics.light()
    await Haptics.selection()
    await Haptics.success()
    await Haptics.androidLongPress()

    expect(expoHaptics.impactAsync).toHaveBeenCalledWith('light')
    expect(expoHaptics.selectionAsync).toHaveBeenCalledOnce()
    expect(expoHaptics.notificationAsync).toHaveBeenCalledWith('success')
    expect(expoHaptics.performAndroidHapticsAsync).toHaveBeenCalledWith(
      'long-press'
    )
  })

  it('stays still when the User turns haptics off', async () => {
    usePreferences.getState().set({ hapticsEnabled: false })

    await Promise.all(Object.values(Haptics).map((play) => play()))

    Object.values(expoHaptics).forEach((fn) =>
      expect(fn).not.toHaveBeenCalled()
    )
  })

  it('stays on this device instead of syncing', () => {
    expect(NON_SYNCABLE_PREFERENCE_KEYS.has('hapticsEnabled')).toBe(true)
  })
})
