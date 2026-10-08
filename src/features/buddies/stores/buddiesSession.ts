import { create } from 'zustand'
import {
  initialBuddySyncStatus,
  type BuddySyncStatus,
} from '@/features/buddies/lib/syncStatus'

/**
 * What this app session has learned about reaching Buddies. In memory only: a
 * fresh launch starts clean and finds out again on its first sync.
 */
export const useBuddiesSession = create<
  BuddySyncStatus & {
    /**
     * Answers and requests to join being sent right now, so they don't flash as
     * unsent while the first try is still on its way.
     */
    sending: number
    /** The `buddies` flag loaded on during this session. */
    flagConfirmed: boolean
    /**
     * Buddies is shown and started, so its background runtime is running. Badge
     * news is made and sent only then.
     */
    running: boolean
  }
>()(() => ({
  ...initialBuddySyncStatus,
  sending: 0,
  flagConfirmed: false,
  running: false,
}))
