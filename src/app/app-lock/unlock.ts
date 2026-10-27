import { AppState, Platform } from 'react-native'
import i18n from '@/lib/locales'
import { authenticateAppLock } from '@/lib/appLock'
import { isLayoutDirectionReloadDue } from '@/app/launch/layoutDirection'
import { useAppLockSession, useAppLockSettings } from '@/stores/appLock'
import { isStorageLocked } from '@/stores/mmkv'
import { revealAfterUnlock } from '../../../modules/app-switcher-privacy'

let prompting = false
let askedAtLaunch = false

/**
 * Asks Face ID, Touch ID or the device passcode to unlock the app, one prompt
 * at a time, and opens it unless the device owner cancels.
 */
export async function promptUnlock() {
  if (prompting) return
  prompting = true
  try {
    const result = await authenticateAppLock(i18n.t('appLock_promptMessage'))
    // A device without a passcode has nothing to unlock with; don't trap the
    // user behind the lock.
    if (result === 'cancelled') return
    useAppLockSession.setState({ locked: false })
    // Face ID's success animation keeps the app inactive, and so under the
    // app switcher's cover, for about a second more.
    revealAfterUnlock()
  } finally {
    prompting = false
  }
}

/**
 * At launch, asks before React draws anything, so Face ID runs while the first
 * screen renders under the splash rather than after it. iOS only: Android's
 * prompt needs its activity ready, so it waits for `AppLockGate` to mount. A
 * launch that reloads for its layout direction leaves asking to the reload.
 */
export function promptUnlockAtLaunch() {
  if (Platform.OS !== 'ios' || isStorageLocked()) return
  if (!useAppLockSettings.getState().enabled) return
  if (!useAppLockSession.getState().locked) return
  if (AppState.currentState !== 'active' || isLayoutDirectionReloadDue()) return
  askedAtLaunch = true
  void promptUnlock()
}

/**
 * Whether this launch already asked from `promptUnlockAtLaunch`. The lock
 * screen then doesn't ask again as it appears: a cancel there means the User
 * chose to stay on it.
 */
export const wasAskedAtLaunch = () => askedAtLaunch
