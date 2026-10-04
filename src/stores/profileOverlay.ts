import { create } from 'zustand'

/** Window-space rect the profile overlay grows out of and shrinks back into. */
export type OriginRect = { x: number; y: number; width: number; height: number }

/**
 * Ephemeral, non-persisted state for the profile overlay. Every root header's
 * account menu opens it, but HomeTabStack mounts the one overlay.
 *
 * - The header avatar reports its rect with `setOrigin()` once idle, so the
 *   overlay can mount its heavy subtree before any tap.
 * - The account menu's Profile item calls `show()` with a fresh measurement.
 */
type ProfileOverlayStore = {
  origin: OriginRect | null
  open: boolean
  setOrigin: (origin: OriginRect) => void
  show: (origin: OriginRect) => void
  close: () => void
}

export const useProfileOverlay = create<ProfileOverlayStore>((set) => ({
  origin: null,
  open: false,
  setOrigin: (origin) => set({ origin }),
  show: (origin) => set({ origin, open: true }),
  close: () => set({ open: false }),
}))
