import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import type { BadgeReactionEmoji } from '@/features/buddies/lib/badgeReactions'
import {
  BadgeReactionFrom,
  badgeReactionsFrom,
  BuddiesState,
  initialBuddiesState,
  migrateLegacySettings,
  withoutExpired,
  withoutStoredInviteSecrets,
  withPendingInvitesQueued,
} from '@/features/buddies/lib/state'

export const useBuddies = create<BuddiesState>()(
  persist(() => initialBuddiesState, {
    name: 'buddies',
    version: 1,
    migrate: keepPersistedState,
    storage: createJSONStorage(() => MmkvStorage),

    merge: (persisted, current) => {
      const now = Date.now()

      const restored = migrateLegacySettings(
        (persisted ?? {}) as Partial<BuddiesState>
      )
      const merged = {
        ...current,
        ...restored,

        sharing: { ...current.sharing, ...restored.sharing },
      }
      const kept = { ...merged, ...withoutStoredInviteSecrets(merged) }
      const unexpired = { ...kept, ...withoutExpired(kept, now) }
      return {
        ...unexpired,
        notifications: withPendingInvitesQueued(unexpired, now),
      }
    },
  })
)

export function useBadgeReactions(badgeKey: string): BadgeReactionFrom[] {
  const reactions = useBuddies((state) => state.badgeReactions[badgeKey])
  const buddies = useBuddies((state) => state.buddies)
  return badgeReactionsFrom(reactions, buddies)
}

export function useSentBadgeReaction(
  inboxId: string,
  badgeKey: string
): BadgeReactionEmoji | null {
  return useBuddies(
    (state) => state.sentBadgeReactions[inboxId]?.[badgeKey]?.e ?? null
  )
}
