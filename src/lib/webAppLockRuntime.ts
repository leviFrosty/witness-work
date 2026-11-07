import { Platform } from 'react-native'
import { getRandomBytes } from 'expo-crypto'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { getPasskey } from '@/lib/passkeys'
import { onPasskeyStepUp } from '@/lib/serverAccount/stepUpPrompt'
import {
  createWebAppLock,
  type WebAppLock,
  type WebLockUnlock,
} from '@/lib/webAppLock'
import {
  appLockDelayFor,
  useAppLockSession,
  useAppLockSettings,
} from '@/stores/appLock'
import { toast } from '@/stores/toasts'

export const webAppLock: WebAppLock | null =
  Platform.OS === 'web'
    ? createWebAppLock({
        get: getPasskey,
        randomBytes: getRandomBytes,
        origin: () => window.location.origin,
        credentials: {
          read: () => useAppLockSettings.getState().webCredentials,
          write: (webCredentials) =>
            useAppLockSettings.getState().set({ webCredentials }),
        },
      })
    : null

if (webAppLock) onPasskeyStepUp((result) => webAppLock.noteStepUp(result))

export const captureWebAppLock = (enabled: boolean) =>
  analytics.capture('app_lock_changed', {
    enabled,
    method: 'passkey',
    require_after: appLockDelayFor(
      useAppLockSettings.getState().requireAfter,
      true
    ),
  })

export function turnOffWebAppLock() {
  useAppLockSettings.getState().set({ enabled: false, webCredentials: null })
  useAppLockSession.setState({ locked: false })
}

export function turnOffWebAppLockNoPasskey(): boolean {
  if (useAppLockSession.getState().locked) return false
  turnOffWebAppLock()
  captureWebAppLock(false)
  toast.info(i18n.t('webAppLock_turnedOff'), {
    message: i18n.t('webAppLock_turnedOffMessage'),
  })
  return true
}

export function keepListedWebLockPasskeys(listed: readonly string[]) {
  if (!webAppLock || !useAppLockSettings.getState().enabled) return
  if (useAppLockSession.getState().locked) return
  if (webAppLock.keepListed(listed)) return
  turnOffWebAppLockNoPasskey()
}

const UNLOCK_FAILURES = {
  wrong_credential: 'webAppLock_wrongPasskey',
  no_credentials: 'webAppLock_noPasskeyHere',
  not_supported: 'stepUp_failedNotSupported',
} as const

export const webUnlockFailureMessage = (
  result: Extract<WebLockUnlock, { status: 'refused' | 'failed' }>
) =>
  i18n.t(
    UNLOCK_FAILURES[result.reason as keyof typeof UNLOCK_FAILURES] ??
      'webAppLock_unlockFailedMessage'
  )
