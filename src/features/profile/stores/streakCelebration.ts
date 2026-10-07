import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { SeenStreak, StreakKind } from '@/lib/serviceStreak'
import type { CelebrationClaim } from '@/lib/userAction'
import { MmkvStorage } from '@/stores/mmkv'

type StreakCelebrationState = {
  /** The newest kept day or month seen here; see `nextSeenStreak`. */
  seen: SeenStreak | null
  /**
   * A milestone's full celebration, waiting for its turn or on screen. `claim`
   * ties it to the User's action that reached it; without one (a replay from
   * developer tools) it waits for its turn without expiring.
   */
  celebrating: {
    count: number
    kind: StreakKind
    claim?: CelebrationClaim
  } | null
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
