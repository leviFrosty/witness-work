import { create } from 'zustand'

/**
 * Ephemeral, non-persisted store for The Milestone Update grand-reveal
 * visibility. Lives outside `preferences` because the `show` flag is purely
 * runtime state — we don't want it to persist across app restarts and re-fire
 * the overlay when the user reopens the app.
 *
 * - The home-screen "shaking present" icon calls `request()` to replay.
 * - HomeTabStack's auto-trigger on app launch also calls `request()` so the
 *   render path is unified through this store.
 * - The overlay reads `show` and uses `dismiss()` from its own dismissal
 *   handlers.
 */
type MilestoneRevealStore = {
  show: boolean
  request: () => void
  dismiss: () => void
}

export const useMilestoneRevealStore = create<MilestoneRevealStore>((set) => ({
  show: false,
  request: () => set({ show: true }),
  dismiss: () => set({ show: false }),
}))
