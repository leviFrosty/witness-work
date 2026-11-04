import { useSyncExternalStore } from 'react'
import { mmkvStorage } from '@/stores/mmkv'

/**
 * Whether the User closed the Install App banner. Kept in the app's persisted
 * stores (IndexedDB on the web, docs/web-storage.md), never `localStorage`, so
 * it stays closed across reloads; signing out erases it with the rest.
 */
const KEY = 'webInstall.dismissed'
const listeners = new Set<() => void>()

export const installBannerDismissed = (): boolean =>
  mmkvStorage.getBoolean(KEY) === true

export function dismissInstallBanner(): void {
  mmkvStorage.set(KEY, true)
  listeners.forEach((listener) => listener())
}

export function useInstallBannerDismissed(): boolean {
  return useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, installBannerDismissed)
}
