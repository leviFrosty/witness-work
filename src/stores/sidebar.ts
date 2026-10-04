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

/**
 * Label mode while a drag is live. The width itself animates on the UI thread,
 * so React only hears about a drag when it crosses the icon/label threshold.
 */
export const useSidebarResize = create<{
  compact: boolean | null
  preview: (compact: boolean | null) => void
}>((set) => ({
  compact: null,
  preview: (compact) => set({ compact }),
}))
