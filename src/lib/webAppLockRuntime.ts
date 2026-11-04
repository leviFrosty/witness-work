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

/**
 * The web's App Lock (`webAppLock.ts`) on this browser's stored settings and
 * passkeys. Null on phones.
 */
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

/** `app_lock_changed` for the web's switch and Require delay. */
export const captureWebAppLock = (enabled: boolean) =>
  analytics.capture('app_lock_changed', {
    enabled,
    method: 'passkey',
    require_after: appLockDelayFor(
      useAppLockSettings.getState().requireAfter,
      true
    ),
  })

/** Turns the web's lock off and forgets its passkeys. */
export function turnOffWebAppLock() {
  useAppLockSettings.getState().set({ enabled: false, webCredentials: null })
  useAppLockSession.setState({ locked: false })
}

/**
 * Turns the lock off because nothing here could unlock it any more, and says
 * so. Never while it's locked: only the lock's own unlock (or Sign Out) ends
 * that.
 */
export function turnOffWebAppLockNoPasskey(): boolean {
  if (useAppLockSession.getState().locked) return false
  turnOffWebAppLock()
  captureWebAppLock(false)
  toast.info(i18n.t('webAppLock_turnedOff'), {
    message: i18n.t('webAppLock_turnedOffMessage'),
  })
  return true
}

/**
 * The account's passkeys as just listed: drops the lock's removed ones, and
 * turns the lock off once none it knows is left, since nothing could unlock it.
 * Nothing changes while locked: a list read then mustn't open the lock.
 */
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

/** Why an unlock didn't open the lock, in one sentence. */
export const webUnlockFailureMessage = (
  result: Extract<WebLockUnlock, { status: 'refused' | 'failed' }>
) =>
  i18n.t(
    UNLOCK_FAILURES[result.reason as keyof typeof UNLOCK_FAILURES] ??
      'webAppLock_unlockFailedMessage'
  )
