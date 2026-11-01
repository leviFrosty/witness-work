import { create } from 'zustand'

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
