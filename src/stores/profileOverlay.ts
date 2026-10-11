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
 * - A badge opened from the overlay steps it away (`stepAway()`, then `hide()`
 *   once it has faded); the badge view's close brings it back (`comeBack()`).
 */
type ProfileOverlayStore = {
  origin: OriginRect | null
  open: boolean
  /** Out of the way of a badge view, to open again as that closes. */
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
  // Only while still away: the badge view may already have closed.
  hide: () => set((s) => (s.away ? { open: false } : {})),
  comeBack: () => set((s) => (s.away ? { open: true, away: false } : {})),
}))
