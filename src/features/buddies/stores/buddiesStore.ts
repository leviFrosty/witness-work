import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { MmkvStorage } from '@/stores/mmkv'
import type { BadgeReactionEmoji } from '@/features/buddies/lib/badgeReactions'
import {
  BadgeReactionFrom,
  badgeReactionsFrom,
  BuddiesState,
  initialBuddiesState,
  withoutExpired,
  withPendingInvitesQueued,
} from '@/features/buddies/lib/state'

/**
 * Device-local Buddies state (MMKV). Deliberately outside the iCloud Sync
 * payload: a User's other devices restore buddies from the encrypted roster on
 * the relay, keyed by the iCloud Keychain root seed.
 */
export const useBuddies = create<BuddiesState>()(
  persist(() => initialBuddiesState, {
    name: 'buddies',
    version: 1,
    storage: createJSONStorage(() => MmkvStorage),
    // Lapsed shares are wiped before anything restored is shown, even offline,
    // and every invitation still to answer is listed.
    merge: (persisted, current) => {
      const now = Date.now()
      // Undefined on a fresh install.
      const restored = (persisted ?? {}) as Partial<BuddiesState>
      const merged = {
        ...current,
        ...restored,
        // Sharing choices added since (the streak, badges) start at their
        // default.
        sharing: { ...current.sharing, ...restored.sharing },
      }
      const unexpired = { ...merged, ...withoutExpired(merged, now) }
      return {
        ...unexpired,
        notifications: withPendingInvitesQueued(unexpired, now),
      }
    },
  })
)

/**
 * Buddies' reactions to one of this User's badges (a `BadgeKey`, e.g.
 * `yearRound.3`), from active buddies only, newest first. `buddy` is the whole
 * buddy, for `BuddyAvatar` and `buddyDisplayName`.
 */
export function useBadgeReactions(badgeKey: string): BadgeReactionFrom[] {
  const reactions = useBuddies((state) => state.badgeReactions[badgeKey])
  const buddies = useBuddies((state) => state.buddies)
  return badgeReactionsFrom(reactions, buddies)
}

/** The reaction this device sent to a buddy's badge, or null. */
export function useSentBadgeReaction(
  inboxId: string,
  badgeKey: string
): BadgeReactionEmoji | null {
  return useBuddies(
    (state) => state.sentBadgeReactions[inboxId]?.[badgeKey]?.e ?? null
  )
}
