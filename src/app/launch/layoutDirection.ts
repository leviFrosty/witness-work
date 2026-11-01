import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { _i18n } from '@/lib/locales'
import { logger } from '@/lib/logger'
import { launchRead, reloadApp } from '@/lib/hotUpdater'
import { applyLayoutDirectionAtLaunch } from '@/lib/rtl'
import { isStorageLocked } from '@/stores/mmkv'
import {
  dropLaunchHandoff,
  handOffLaunchBeforeReload,
  restoreLaunchAfterReload,
} from '@/app/launch/reloadHandoff'

restoreLaunchAfterReload()
let reloadDue = false

if (!isStorageLocked())
  applyLayoutDirectionAtLaunch(_i18n.locale, () => {
    reloadDue = true
  })

export function isLayoutDirectionReloadDue(): boolean {
  return reloadDue
}

export const RELOAD_GIVE_UP_MS = 5000

export function reloadWhenReady(
  reload: () => Promise<void>,
  ready: Promise<unknown>,
  showApp: () => void
): () => void {
  let isReady = false
  let done = false
  let giveUp: ReturnType<typeof setTimeout> | undefined

  const stop = () => {
    done = true
    clearTimeout(giveUp)
    subscription.remove()
  }
  const tryReload = () => {
    if (done || !isReady || AppState.currentState !== 'active') return
    stop()
    reload().catch((err: unknown) => {
      logger.error('[layoutDirection] reload failed', err)
      showApp()
    })
  }

  const watchSplash = () => {
    if (AppState.currentState === 'background') {
      clearTimeout(giveUp)
      giveUp = undefined
    } else if (giveUp === undefined) {
      giveUp = setTimeout(() => {
        if (done) return
        stop()
        logger.warn('[layoutDirection] gave up waiting to reload')
        showApp()
      }, RELOAD_GIVE_UP_MS)
    }
  }

  const subscription = AppState.addEventListener('change', () => {
    if (done) return
    watchSplash()
    tryReload()
  })
  void ready.then(() => {
    isReady = true
    tryReload()
  })
  watchSplash()
  return stop
}

export function useLayoutDirectionReload(): boolean {
  const [due, setDue] = useState(reloadDue)
  useEffect(() => {
    if (!reloadDue) return
    return reloadWhenReady(
      () => handOffLaunchBeforeReload().then(reloadApp),
      launchRead,
      () => {
        dropLaunchHandoff()
        setDue(false)
      }
    )
  }, [])
  return due
}
