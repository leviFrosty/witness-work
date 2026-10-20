import { beforeEach, describe, expect, it, vi } from 'vitest'

const localAuth = vi.hoisted(() => ({
  authenticateAsync: vi.fn(),
  getEnrolledLevelAsync: vi.fn(),
  supportedAuthenticationTypesAsync: vi.fn(),
}))

vi.mock('expo-local-authentication', () => ({
  ...localAuth,
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
}))

const linking = vi.hoisted(() => ({
  sendIntent: vi.fn(),
  openSettings: vi.fn(),
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' }, Linking: linking }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))

import {
  appLockMethod,
  authenticateAppLock,
  openScreenLockSettings,
  shouldRelock,
} from '@/lib/appLock'
import { useAppLockSession } from '@/stores/appLock'

describe('appLockMethod', () => {
  it('names Face ID before Touch ID on iOS', () => {
    expect(appLockMethod('ios', [1, 2])).toBe('faceId')
    expect(appLockMethod('ios', [1])).toBe('touchId')
    expect(appLockMethod('ios', [])).toBe('passcode')
  })

  it('uses one generic method on Android', () => {
    expect(appLockMethod('android', [2])).toBe('biometrics')
  })
})

describe('openScreenLockSettings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens the Security settings screen', async () => {
    linking.sendIntent.mockResolvedValue(undefined)
    await openScreenLockSettings()
    expect(linking.sendIntent).toHaveBeenCalledWith(
      'android.settings.SECURITY_SETTINGS'
    )
    expect(linking.openSettings).not.toHaveBeenCalled()
  })

  it("falls back to the app's settings when that screen can't open", async () => {
    linking.sendIntent.mockRejectedValue(new Error('No Activity found'))
    await openScreenLockSettings()
    expect(linking.openSettings).toHaveBeenCalled()
  })
})

describe('shouldRelock', () => {
  it('relocks at once with no delay', () => {
    expect(shouldRelock(0, 0)).toBe(true)
  })

  it('waits out the chosen delay', () => {
    expect(shouldRelock(59_999, 60)).toBe(false)
    expect(shouldRelock(60_000, 60)).toBe(true)
  })
})

describe('authenticateAppLock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localAuth.supportedAuthenticationTypesAsync.mockResolvedValue([2])
  })

  it('succeeds and clears the in-progress flag', async () => {
    localAuth.authenticateAsync.mockImplementation(async () => {
      expect(useAppLockSession.getState().authenticating).toBe(true)
      return { success: true }
    })
    await expect(authenticateAppLock('Unlock')).resolves.toBe('success')
    expect(useAppLockSession.getState().authenticating).toBe(false)
  })

  it('treats a cancelled prompt as cancelled', async () => {
    localAuth.authenticateAsync.mockResolvedValue({
      success: false,
      error: 'user_cancel',
    })
    await expect(authenticateAppLock('Unlock')).resolves.toBe('cancelled')
  })

  it('opens only when the device has no passcode at all', async () => {
    localAuth.authenticateAsync.mockResolvedValue({
      success: false,
      error: 'passcode_not_set',
    })
    localAuth.getEnrolledLevelAsync.mockResolvedValue(0)
    await expect(authenticateAppLock('Unlock')).resolves.toBe('unavailable')
  })

  it('stays locked when a busy sensor is unavailable but a passcode is set', async () => {
    localAuth.authenticateAsync.mockResolvedValue({
      success: false,
      error: 'not_available',
    })
    localAuth.getEnrolledLevelAsync.mockResolvedValue(1)
    await expect(authenticateAppLock('Unlock')).resolves.toBe('cancelled')
  })
})
