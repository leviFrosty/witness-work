import * as LocalAuthentication from 'expo-local-authentication'
import { useAppLockSession } from '@/stores/appLock'

/**
 * How asking the device's owner turned out: `confirmed` (Face ID, Touch ID,
 * fingerprint, passcode or screen lock), `noLock` (none is set, so there's
 * nothing to ask), `cancelled` by the User or the system, or `failed`.
 */
export type DeviceOwnerCheck = 'confirmed' | 'noLock' | 'cancelled' | 'failed'

const CANCELLED = new Set(['user_cancel', 'system_cancel', 'app_cancel'])

/**
 * Asks the device's own authentication before showing a secret, when the device
 * has any: biometrics with the passcode or screen lock as a fallback.
 */
export async function confirmDeviceOwner(
  promptMessage: string
): Promise<DeviceOwnerCheck> {
  const level = await LocalAuthentication.getEnrolledLevelAsync()
  if (level === LocalAuthentication.SecurityLevel.NONE) return 'noLock'
  // Android's passcode screen backgrounds the app; tell the app lock it's ours.
  useAppLockSession.setState({ authenticating: true })
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      disableDeviceFallback: false,
    })
    if (result.success) return 'confirmed'
    return CANCELLED.has(result.error) ? 'cancelled' : 'failed'
  } finally {
    useAppLockSession.setState({ authenticating: false })
  }
}
