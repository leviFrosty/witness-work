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

/**
 * Device-local Buddies state (MMKV). Deliberately outside the iCloud Sync
 * payload: a User's other devices restore buddies from the encrypted roster on
 * the relay, keyed by the iCloud Keychain root seed.
 */
export const useBuddies = create<BuddiesState>()(
  persist(() => initialBuddiesState, {
    name: 'buddies',
    version: 1,
    migrate: keepPersistedState,
    storage: createJSONStorage(() => MmkvStorage),
    // Lapsed shares are wiped before anything restored is shown, even offline,
    // and every invitation still to answer is listed. Car invitations' secrets
    // are never saved here (`deviceInviteSecrets`); an earlier build's go.
    merge: (persisted, current) => {
      const now = Date.now()
      // Undefined on a fresh install.
      const restored = migrateLegacySettings(
        (persisted ?? {}) as Partial<BuddiesState>
      )
      const merged = {
        ...current,
        ...restored,
        // Settings added since (the streak, badges, Plans) start at their
        // default.
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
