import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import { clampSidebarWidth, SIDEBAR_DEFAULT_WIDTH } from '@/lib/sidebarLayout'

type SidebarPreferences = {
  width: number
  hidden: boolean
  setWidth: (width: number) => void
  toggle: () => void
}

export const useSidebarPreferences = create<SidebarPreferences>()(
  persist(
    (set) => ({
      width: SIDEBAR_DEFAULT_WIDTH,
      hidden: false,
      setWidth: (width) => set({ width: clampSidebarWidth(width) }),
      toggle: () => set((state) => ({ hidden: !state.hidden })),
    }),
    {
      name: 'sidebar-layout',
      migrate: keepPersistedState,
      storage: createJSONStorage(() => MmkvStorage),
      partialize: ({ width, hidden }) => ({ width, hidden }),
    }
  )
)

export const useSidebarResize = create<{
  compact: boolean | null
  preview: (compact: boolean | null) => void
}>((set) => ({
  compact: null,
  preview: (compact) => set({ compact }),
}))
