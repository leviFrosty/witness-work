import { create } from 'zustand'

/** What opened the update reveal. Bounded, so it's safe as an analytics value. */
export type UpdateRevealSource = 'launch' | 'tray' | 'whats_new' | 'dev'

/**
 * Ephemeral, non-persisted visibility for the update reveal. Lives outside
 * `preferences` so the overlay never re-fires on a cold start. The launch
 * itself is decided by `HomeTabStack` during its first render; this store
 * carries every replay (the tray item, What's New, Developer Tools).
 */
type UpdateRevealStore = {
  source: UpdateRevealSource | null
  request: (source: UpdateRevealSource) => void
  dismiss: () => void
}

export const useUpdateRevealStore = create<UpdateRevealStore>((set) => ({
  source: null,
  request: (source) => set({ source }),
  dismiss: () => set({ source: null }),
}))
