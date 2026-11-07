import { useSyncExternalStore } from 'react'
import { mmkvStorage } from '@/stores/mmkv'

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
