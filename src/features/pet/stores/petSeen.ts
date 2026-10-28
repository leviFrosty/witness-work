import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import type { PetShown } from '@/features/pet/lib/reveal'
import type { EarnedCounts } from '@/features/pet/lib/rewardLines'

/** The hearts and wallet this device last showed, for one pet. */
export type PetSeen = PetShown & {
  /** The pet they belong to (`seenPetKey`); another pet starts over. */
  pet: string
  /**
   * What had earned the wallet then, so the card can say what earned the rest
   * (`rewardLines`). Absent from before the reward stack.
   */
  earned?: EarnedCounts
}

type PetSeenState = {
  seen: PetSeen | null
  markSeen: (seen: PetSeen) => void
  /**
   * The User saw a save's reward play (`petRewardProbe`): its coins and what
   * earned them are seen, so the card doesn't play them again. Hearts are left
   * for the card.
   */
  markEarnedSeen: (pet: string, coins: number, earned: EarnedCounts) => void
}

/**
 * Device-local, like a notification: each device shows the pet's hearts and
 * coins as it last showed them, until they're on screen again, then plays the
 * change (`usePetReveal`). Never synced.
 */
export const usePetSeen = create<PetSeenState>()(
  persist<PetSeenState, [], [], Pick<PetSeenState, 'seen'>>(
    (set) => ({
      seen: null,
      markSeen: (seen) => set({ seen }),
      markEarnedSeen: (pet, coins, earned) =>
        set(({ seen }) =>
          seen?.pet === pet ? { seen: { ...seen, coins, earned } } : {}
        ),
    }),
    {
      name: 'petSeen',
      version: 1,
      migrate: keepPersistedState,
      storage: createJSONStorage(() => MmkvStorage),
      partialize: ({ seen }) => ({ seen }),
    }
  )
)
