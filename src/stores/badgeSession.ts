import { create } from 'zustand'
import type { BadgeEvaluation } from '@/lib/badges/evaluate'
import type { CelebrationClaim } from '@/lib/userAction'
import type { BadgeKey } from '@/types/badges'

type BadgeSessionState = {
  /** The latest evaluation, for progress toward each next level. */
  evaluation: BadgeEvaluation | null
  /** Badges earned by the User's own action, waiting to be celebrated. */
  celebrations: BadgeKey[]
  /**
   * The action behind `celebrations`: they celebrate full screen only while
   * it's recent, and only if nothing else celebrated it. Null for a celebration
   * asked for directly (Developer Tools), which waits for its turn without
   * expiring.
   */
  claim: CelebrationClaim | null
  /** Badges found in history since the last summary was shown. */
  historyCount: number
  setEvaluation: (evaluation: BadgeEvaluation) => void
  celebrate: (keys: BadgeKey[], claim?: CelebrationClaim | null) => void
  addHistory: (count: number) => void
  /** Drops what was just shown, or what went quiet. */
  clearCelebrations: () => void
  clearHistory: () => void
  /** Forgets the queue, e.g. after the User resets their badges. */
  reset: () => void
}

/**
 * Ephemeral badge state for this app session. Earned badges themselves live in
 * `preferences.earnedBadges`; this holds only what's derived or pending. A
 * celebration that never gets its turn isn't lost: the badge is already saved
 * and new, so the Home "New badge" card names it.
 */
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
      // Keys joining a waiting celebration ride on its turn.
      claim: celebrations.length > 0 ? current : claim,
    })),
  addHistory: (count) =>
    set(({ historyCount }) => ({ historyCount: historyCount + count })),
  clearCelebrations: () => set({ celebrations: [], claim: null }),
  clearHistory: () => set({ historyCount: 0 }),
  reset: () =>
    set({ evaluation: null, celebrations: [], claim: null, historyCount: 0 }),
}))
