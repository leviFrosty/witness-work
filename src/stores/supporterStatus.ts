import { create } from 'zustand'
import { mmkvStorage } from '@/stores/mmkv'

const LAST_KNOWN_KEY = 'supporter.lastKnown'

const readLastKnown = (): boolean => {
  try {
    return mmkvStorage.getBoolean(LAST_KNOWN_KEY) ?? false
  } catch {
    return false
  }
}

/**
 * Mirror of `useIsSupporter()` so non-React code (widget snapshot writer,
 * iCloud sync gate, etc.) can read supporter status synchronously without
 * round-tripping through `CustomerContext` or recomputing from RevenueCat.
 *
 * Starts from the last status RevenueCat reported, kept in MMKV, so launch,
 * widget refreshes and background tasks don't treat a supporter as lapsed while
 * RevenueCat hasn't answered yet. `SupporterStoreSync` overwrites it as soon as
 * RevenueCat answers. Purchase gates keep reading `useIsSupporter`, never this
 * cache.
 */
type SupporterState = {
  isSupporter: boolean
  setSupporter: (isSupporter: boolean) => void
}

export const useSupporter = create<SupporterState>((set, get) => ({
  isSupporter: readLastKnown(),
  setSupporter: (isSupporter) => {
    if (get().isSupporter !== isSupporter) set({ isSupporter })
    try {
      if (readLastKnown() !== isSupporter)
        mmkvStorage.set(LAST_KNOWN_KEY, isSupporter)
    } catch {
      // The cache is only a hint; the next answer writes it again.
    }
  },
}))
