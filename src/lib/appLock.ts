import { Linking, Platform } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import { openAppSettings } from '@/lib/openAppSettings'
import i18n from '@/lib/locales'
import { useAppLockSession } from '@/stores/appLock'

/** How this device proves it's the owner, for labels and icons. */
export type AppLockMethod = 'faceId' | 'touchId' | 'passcode' | 'biometrics'

export type AppLockAvailability = {
  method: AppLockMethod
  /** False when the device has no passcode, so there is nothing to unlock with. */
  available: boolean
}

export async function getAppLockAvailability(): Promise<AppLockAvailability> {
  const [types, level] = await Promise.all([
    LocalAuthentication.supportedAuthenticationTypesAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
  ])
  return {
    method: appLockMethod(Platform.OS, types),
    available: level !== LocalAuthentication.SecurityLevel.NONE,
  }
}

/**
 * Opens Android's Security settings, where the screen lock is set. Falls back
 * to the app's settings page when a device doesn't handle that screen.
 */
export async function openScreenLockSettings() {
  try {
    await Linking.sendIntent('android.settings.SECURITY_SETTINGS')
  } catch {
    await openAppSettings()
  }
}

export function appLockMethod(
  os: typeof Platform.OS,
  types: LocalAuthentication.AuthenticationType[]
): AppLockMethod {
  if (os !== 'ios') return 'biometrics'
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION))
    return 'faceId'
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT))
    return 'touchId'
  return 'passcode'
}

export function appLockRequireLabel(method: AppLockMethod) {
  switch (method) {
    case 'faceId':
      return i18n.t('appLock_requireFaceId')
    case 'touchId':
      return i18n.t('appLock_requireTouchId')
    case 'passcode':
      return i18n.t('appLock_requirePasscode')
    case 'biometrics':
      return i18n.t('appLock_requireBiometricsAndroid')
  }
}

export function appLockUnlockLabel(method: AppLockMethod) {
  switch (method) {
    case 'faceId':
      return i18n.t('appLock_unlockWithFaceId')
    case 'touchId':
      return i18n.t('appLock_unlockWithTouchId')
    case 'passcode':
    case 'biometrics':
      return i18n.t('appLock_unlock')
  }
}

export type AppLockAuthResult = 'success' | 'cancelled' | 'unavailable'

/**
 * Asks the system to confirm the device owner. Falls back to the device
 * passcode, so a failed Face ID or Touch ID can never lock someone out.
 */
export async function authenticateAppLock(
  promptMessage: string
): Promise<AppLockAuthResult> {
  useAppLockSession.setState({ authenticating: true })
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: i18n.t('cancel'),
    })
    if (result.success) return 'success'
    // Only a device with no passcode at all counts: a busy sensor also
    // reports `not_available`, and that mustn't open the app.
    if (
      ['not_enrolled', 'passcode_not_set', 'not_available'].includes(
        result.error
      ) &&
      !(await getAppLockAvailability()).available
    ) {
      return 'unavailable'
    }
    return 'cancelled'
  } catch {
    return 'cancelled'
  } finally {
    useAppLockSession.setState({ authenticating: false })
  }
}

/** Whether coming back after `awayMs` away should ask to unlock again. */
export function shouldRelock(awayMs: number, requireAfterSeconds: number) {
  return awayMs >= requireAfterSeconds * 1000
}
