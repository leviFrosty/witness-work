import * as LocalAuthentication from 'expo-local-authentication'
import { useAppLockSession } from '@/stores/appLock'

export type DeviceOwnerCheck = 'confirmed' | 'noLock' | 'cancelled' | 'failed'

const CANCELLED = new Set(['user_cancel', 'system_cancel', 'app_cancel'])

export async function confirmDeviceOwner(
  promptMessage: string
): Promise<DeviceOwnerCheck> {
  const level = await LocalAuthentication.getEnrolledLevelAsync()
  if (level === LocalAuthentication.SecurityLevel.NONE) return 'noLock'

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
