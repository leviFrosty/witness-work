import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import type { SeenStreak, StreakKind } from '@/lib/serviceStreak'
import type { CelebrationClaim } from '@/lib/userAction'
import { MmkvStorage } from '@/stores/mmkv'

type StreakCelebrationState = {
  seen: SeenStreak | null

  celebrating: {
    count: number
    kind: StreakKind
    claim?: CelebrationClaim
  } | null

  grewAt: number
}

export const useStreakCelebration = create<StreakCelebrationState>()(
  persist<StreakCelebrationState, [], [], Pick<StreakCelebrationState, 'seen'>>(
    () => ({ seen: null, celebrating: null, grewAt: 0 }),
    {
      name: 'streakCelebration',
      version: 1,
      migrate: keepPersistedState,
      storage: createJSONStorage(() => MmkvStorage),
      partialize: ({ seen }) => ({ seen }),
    }
  )
)
