import { create } from 'zustand'
import type { BadgeEvaluation } from '@/lib/badges/evaluate'
import type { CelebrationClaim } from '@/lib/userAction'
import type { BadgeKey } from '@/types/badges'

type BadgeSessionState = {
  evaluation: BadgeEvaluation | null

  celebrations: BadgeKey[]

  claim: CelebrationClaim | null

  historyCount: number
  setEvaluation: (evaluation: BadgeEvaluation) => void
  celebrate: (keys: BadgeKey[], claim?: CelebrationClaim | null) => void
  addHistory: (count: number) => void

  clearCelebrations: () => void
  clearHistory: () => void

  reset: () => void
}

export const useBadgeSession = create<BadgeSessionState>((set) => ({
  evaluation: null,
  celebrations: [],
  claim: null,
  historyCount: 0,
  setEvaluation: (evaluation) => set({ evaluation }),
  celebrate: (keys, claim = null) =>
    set(({ celebrations, claim: current }) => ({
      celebrations: [
        ...celebrations,
        ...keys.filter((key) => !celebrations.includes(key)),
      ],

      claim: celebrations.length > 0 ? current : claim,
    })),
  addHistory: (count) =>
    set(({ historyCount }) => ({ historyCount: historyCount + count })),
  clearCelebrations: () => set({ celebrations: [], claim: null }),
  clearHistory: () => set({ historyCount: 0 }),
  reset: () =>
    set({ evaluation: null, celebrations: [], claim: null, historyCount: 0 }),
}))
