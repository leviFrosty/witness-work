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
    } catch {}
  },
}))
