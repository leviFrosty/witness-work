import { AppState, Platform } from 'react-native'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { authenticateAppLock } from '@/lib/appLock'
import { isLayoutDirectionReloadDue } from '@/app/launch/layoutDirection'
import { useAppLockSession, useAppLockSettings } from '@/stores/appLock'
import { isStorageLocked } from '@/stores/mmkv'
import { webAppLock, webUnlockFailureMessage } from '@/lib/webAppLockRuntime'
import { revealAfterUnlock } from '../../../modules/app-switcher-privacy'

let prompting = false
let askedAtLaunch = false

export async function promptUnlock() {
  if (prompting) return
  prompting = true
  try {
    const result = await authenticateAppLock(i18n.t('appLock_promptMessage'))

    if (result === 'cancelled') return
    useAppLockSession.setState({ locked: false })

    revealAfterUnlock()
  } finally {
    prompting = false
  }
}

export function promptUnlockAtLaunch() {
  if (Platform.OS !== 'ios' || isStorageLocked()) return
  if (!useAppLockSettings.getState().enabled) return
  if (!useAppLockSession.getState().locked) return
  if (AppState.currentState !== 'active' || isLayoutDirectionReloadDue()) return
  askedAtLaunch = true
  void promptUnlock()
}

export const wasAskedAtLaunch = () => askedAtLaunch

export async function unlockWebAppLock(): Promise<string | null> {
  if (!webAppLock || prompting) return null
  prompting = true
  useAppLockSession.setState({ authenticating: true })
  try {
    const result = await webAppLock.unlock()
    switch (result.status) {
      case 'unlocked':
        useAppLockSession.setState({ locked: false })
        void import('@/app/account/passkeys')
          .then(({ loadPasskeys }) => loadPasskeys())
          .catch((error: unknown) =>
            logger.debug('[app-lock] listing passkeys failed', error)
          )
        return null

      case 'cancelled':
        return i18n.t('webAppLock_unlockStopped')
      case 'noCredentials':
        return i18n.t('webAppLock_noKeptPasskey')
      default:
        return webUnlockFailureMessage(result)
    }
  } finally {
    useAppLockSession.setState({ authenticating: false })
    prompting = false
  }
}
