import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'

export const SPLIT_SHEET_MIN_RATIO = 0.3
export const SPLIT_SHEET_MAX_RATIO = 0.65
export const SPLIT_SHEET_DEFAULT_RATIO = 0.5

export const SPLIT_SHEET_KEYBOARD_RATIO = 0.85

export const clampSplitSheetRatio = (ratio: number) =>
  Math.min(Math.max(ratio, SPLIT_SHEET_MIN_RATIO), SPLIT_SHEET_MAX_RATIO)

type SplitSheetPreferences = {
  ratio: number
  setRatio: (ratio: number) => void
}

export const useSplitSheetPreferences = create<SplitSheetPreferences>()(
  persist(
    (set) => ({
      ratio: SPLIT_SHEET_DEFAULT_RATIO,
      setRatio: (ratio) => set({ ratio: clampSplitSheetRatio(ratio) }),
    }),
    {
      name: 'split-sheet-layout',
      migrate: keepPersistedState,
      storage: createJSONStorage(() => MmkvStorage),
      partialize: ({ ratio }) => ({ ratio }),
    }
  )
)
