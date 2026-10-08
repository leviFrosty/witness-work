import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { SeenStreak, StreakKind } from '@/lib/serviceStreak'
import { MmkvStorage } from '@/stores/mmkv'

type StreakCelebrationState = {
  /** The newest kept day or month seen here; see `nextSeenStreak`. */
  seen: SeenStreak | null
  /** The full celebration on screen now, at a milestone. */
  celebrating: { count: number; kind: StreakKind } | null
  /** When the streak last grew short of a milestone: the Home chip flares. */
  grewAt: number
}

/**
 * Device-local, like a notification: each device celebrates the growth it sees,
 * once. Only `seen` outlives a launch.
 */
export const useStreakCelebration = create<StreakCelebrationState>()(
  persist<StreakCelebrationState, [], [], Pick<StreakCelebrationState, 'seen'>>(
    () => ({ seen: null, celebrating: null, grewAt: 0 }),
    {
      name: 'streakCelebration',
      version: 1,
      storage: createJSONStorage(() => MmkvStorage),
      partialize: ({ seen }) => ({ seen }),
    }
  )
)
