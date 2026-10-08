import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { MmkvStorage } from '@/stores/mmkv'
import {
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
        // A sharing choice added since (the streak) starts at its default.
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
