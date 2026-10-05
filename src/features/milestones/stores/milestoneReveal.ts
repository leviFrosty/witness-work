import { create } from 'zustand'

/**
 * Runtime visibility of The Milestone Update (1.38.2) grand reveal, which is
 * replay-only now: Developer Tools calls `request()`, and the overlay in
 * HomeTabStack reads `show` and calls `dismiss()` when it closes. Launches show
 * the current update reveal instead.
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
