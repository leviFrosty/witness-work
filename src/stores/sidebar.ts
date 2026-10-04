import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { MmkvStorage } from '@/stores/mmkv'
import { clampSidebarWidth, SIDEBAR_DEFAULT_WIDTH } from '@/lib/sidebarLayout'

type SidebarPreferences = {
  width: number
  hidden: boolean
  setWidth: (width: number) => void
  toggle: () => void
}

/** Device-local UI preferences; excluded from sync and ministry backups. */
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
      storage: createJSONStorage(() => MmkvStorage),
      partialize: ({ width, hidden }) => ({ width, hidden }),
    }
  )
)

/** Live navigation width; content breakpoints adopt the saved width on release. */
export const useSidebarResize = create<{
  width: number | null
  preview: (width: number | null) => void
}>((set) => ({
  width: null,
  preview: (width) =>
    set({ width: width === null ? null : clampSidebarWidth(width) }),
}))
