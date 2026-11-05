import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import type { PetShown } from '@/features/pet/lib/reveal'
import type { EarnedCounts } from '@/features/pet/lib/rewardLines'
import { COIN_SCALE } from '@/features/pet/lib/currency'

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
      version: 2,
      migrate: (persisted, version) =>
        migratePetSeen(persisted as Pick<PetSeenState, 'seen'>, version),
      storage: createJSONStorage(() => MmkvStorage),
      partialize: ({ seen }) => ({ seen }),
    }
  )
)

export function migratePetSeen(
  persisted: Pick<PetSeenState, 'seen'>,
  version: number
): Pick<PetSeenState, 'seen'> {
  if (version >= 2 || !persisted?.seen) return persisted
  return {
    ...persisted,
    seen: { ...persisted.seen, coins: persisted.seen.coins * COIN_SCALE },
  }
}
