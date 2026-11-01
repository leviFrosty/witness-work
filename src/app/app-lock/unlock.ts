import { AppState, Platform } from 'react-native'
import i18n from '@/lib/locales'
import { authenticateAppLock } from '@/lib/appLock'
import { isLayoutDirectionReloadDue } from '@/app/launch/layoutDirection'
import { useAppLockSession, useAppLockSettings } from '@/stores/appLock'
import { isStorageLocked } from '@/stores/mmkv'
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
