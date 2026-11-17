import { create } from 'zustand'
import {
  initialBuddySyncStatus,
  type BuddySyncStatus,
} from '@/features/buddies/lib/syncStatus'

export const useBuddiesSession = create<
  BuddySyncStatus & {
    sending: number

    running: boolean
  }
>()(() => ({
  ...initialBuddySyncStatus,
  sending: 0,
  running: false,
}))
