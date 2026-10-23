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

// Imported right after `@/lib/locales` has picked the Language, before
// anything renders. React Native fixes the layout direction when the JS loads,
// so a direction that doesn't match the Language costs one reload (ADR 0026).
// A launch after that reload opens the tap or link that launched the one before.
restoreLaunchAfterReload()
let reloadDue = false
// Before the device's first unlock the User's Language can't be read, so the
// Language here is only the device's, and storage refuses writes. The direction
// is left as saved then; the launch after the unlock reload
// (`useStorageUnlock`) sets it from the User's Language.
if (!isStorageLocked())
  applyLayoutDirectionAtLaunch(_i18n.locale, () => {
    reloadDue = true
  })

/**
 * Whether this launch reloads to fix its layout direction. The launch skips its
 * update download then; the reloaded launch downloads as usual.
 */
export function isLayoutDirectionReloadDue(): boolean {
  return reloadDue
}

/**
 * How long the splash waits for the reload while it may be on screen. Past
 * that, the app shows in the direction it launched with.
 */
export const RELOAD_GIVE_UP_MS = 5000

/**
 * Runs `reload` once `ready` settles and the app is in the foreground.
 *
 * - `ready` is Hot Updater's launch read: reloading earlier can kill the process
 *   (Android) before a freshly applied update is verified, and Hot Updater
 *   would roll it back as a crash.
 * - The foreground, since iOS can launch the app in the background (a background
 *   fetch, a push, a location update), and reloading then would cut that work
 *   off.
 *
 * If the reload hasn't run after `RELOAD_GIVE_UP_MS` outside the background
 * (active, inactive, or a state that never reported), it calls `showApp` and
 * stops waiting, so a missed `active` event or a launch read that never ends
 * can't leave the splash up forever. Showing the app is the safer fallback: a
 * reload then could kill an unverified update or interrupt background work,
 * while the flags are already saved, so the next cold launch comes up in the
 * right direction anyway. `showApp` also runs if the reload fails. Returns a
 * cleanup that stops waiting.
 */
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
  // Counts only while the splash may be on screen.
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

/**
 * Reloads once the app has mounted and Hot Updater has read the launch, since
 * reloading while the bundle is still loading fails on iOS
 * ("AppRegistryBinding::startSurface failed"), and only while the app is in the
 * foreground. True while that reload is due, so the app can keep the splash up
 * instead of flashing the wrong direction; false again if the reload fails or
 * the wait gives up.
 */
export function useLayoutDirectionReload(): boolean {
  const [due, setDue] = useState(reloadDue)
  useEffect(() => {
    if (!reloadDue) return
    return reloadWhenReady(
      // The reloaded launch opens what launched this one.
      () => handOffLaunchBeforeReload().then(reloadApp),
      launchRead,
      () => {
        // No reload after all: this launch opens them itself.
        dropLaunchHandoff()
        setDue(false)
      }
    )
  }, [])
  return due
}
