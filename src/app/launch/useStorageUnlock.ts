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
            dropLaunchHandoff()
            logger.error('[storage] reload after unlock failed', error)
          })
        return
      }

      releaseStorageLock()
      setReady(true)
    }
    if (!isLockedLaunchSimulated()) unlock(AppState.currentState)
    const subscription = AppState.addEventListener('change', unlock)
    return () => subscription.remove()
  }, [ready])

  return ready
}
