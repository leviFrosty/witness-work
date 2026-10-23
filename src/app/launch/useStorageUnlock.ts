import { useEffect, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { reloadApp } from '@/lib/hotUpdater'
import { logger } from '@/lib/logger'
import {
  dropLaunchHandoff,
  handOffLaunchBeforeReload,
} from '@/app/launch/reloadHandoff'
import {
  isLockedLaunchSimulated,
  isStorageLocked,
  releaseStorageLock,
  reopenLockedStorage,
} from '@/stores/mmkv'

/**
 * False while the app launched before the device's first unlock and can't reach
 * its data (see `isStorageLocked`). The app then shows only the splash and runs
 * none of its launch work, so it doesn't open Onboarding, cancel reminders or
 * sync defaults. The User can only open the app once the device is unlocked, so
 * when it becomes active the storage opens again and the app reloads to read
 * the User's data. The tap or link that brought the app up went to this launch,
 * which only shows the splash, so the reloaded one opens it instead.
 */
export function useStorageUnlock(): boolean {
  const [ready, setReady] = useState(() => !isStorageLocked())

  useEffect(() => {
    if (ready) return
    const unlock = (state: AppStateStatus) => {
      if (state !== 'active') return
      if (reopenLockedStorage()) {
        handOffLaunchBeforeReload()
          .then(reloadApp)
          .catch((error: unknown) => {
            // Stays on the splash with writes blocked; the next activation
            // hands off and tries again.
            dropLaunchHandoff()
            logger.error('[storage] reload after unlock failed', error)
          })
        return
      }
      // Unlocked and storage still fails: not the lock, so carry on as the
      // app always did rather than hang on the splash.
      releaseStorageLock()
      setReady(true)
    }
    if (!isLockedLaunchSimulated()) unlock(AppState.currentState)
    const subscription = AppState.addEventListener('change', unlock)
    return () => subscription.remove()
  }, [ready])

  return ready
}
