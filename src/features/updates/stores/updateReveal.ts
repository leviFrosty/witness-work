import { create } from 'zustand'

export type UpdateRevealSource = 'launch' | 'tray' | 'whats_new' | 'dev'

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
