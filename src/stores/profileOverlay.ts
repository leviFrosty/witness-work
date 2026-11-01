import { create } from 'zustand'

export type OriginRect = { x: number; y: number; width: number; height: number }

type ProfileOverlayStore = {
  origin: OriginRect | null
  open: boolean

  away: boolean
  setOrigin: (origin: OriginRect) => void
  show: (origin: OriginRect) => void
  close: () => void
  stepAway: () => void
  hide: () => void
  comeBack: () => void
}

export const useProfileOverlay = create<ProfileOverlayStore>((set) => ({
  origin: null,
  open: false,
  away: false,
  setOrigin: (origin) => set({ origin }),
  show: (origin) => set({ origin, open: true, away: false }),
  close: () => set({ open: false, away: false }),
  stepAway: () => set({ away: true }),

  hide: () => set((s) => (s.away ? { open: false } : {})),
  comeBack: () => set((s) => (s.away ? { open: true, away: false } : {})),
}))
