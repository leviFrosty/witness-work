import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { MmkvStorage } from '@/stores/mmkv'
import { BuddiesState, initialBuddiesState } from '@/features/buddies/lib/state'

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
  })
)
