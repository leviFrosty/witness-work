import { Linking, Platform } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import i18n from '@/lib/locales'
import { useAppLockSession } from '@/stores/appLock'

export type AppLockMethod = 'faceId' | 'touchId' | 'passcode' | 'biometrics'

export type AppLockAvailability = {
  method: AppLockMethod

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

export async function openScreenLockSettings() {
  try {
    await Linking.sendIntent('android.settings.SECURITY_SETTINGS')
  } catch {
    await Linking.openSettings()
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

export function shouldRelock(awayMs: number, requireAfterSeconds: number) {
  return awayMs >= requireAfterSeconds * 1000
}
