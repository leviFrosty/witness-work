import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { MmkvStorage } from '@/stores/mmkv'
import {
  BuddiesState,
  initialBuddiesState,
  withoutExpired,
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
    // Lapsed shares are wiped before anything restored is shown, even offline.
    merge: (persisted, current) => {
      const merged = { ...current, ...(persisted as Partial<BuddiesState>) }
      return { ...merged, ...withoutExpired(merged, Date.now()) }
    },
  })
)
