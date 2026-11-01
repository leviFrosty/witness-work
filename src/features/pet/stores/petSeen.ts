import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import type { PetShown } from '@/features/pet/lib/reveal'
import type { EarnedCounts } from '@/features/pet/lib/rewardLines'

export type PetSeen = PetShown & {
  pet: string

  earned?: EarnedCounts
}

type PetSeenState = {
  seen: PetSeen | null
  markSeen: (seen: PetSeen) => void

  markEarnedSeen: (pet: string, coins: number, earned: EarnedCounts) => void
}

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
