import { create } from 'zustand'
import {
  initialBuddySyncStatus,
  type BuddySyncStatus,
} from '@/features/buddies/lib/syncStatus'

export const useBuddiesSession = create<
  BuddySyncStatus & {
    sending: number

    flagConfirmed: boolean

    running: boolean
  }
>()(() => ({
  ...initialBuddySyncStatus,
  sending: 0,
  flagConfirmed: false,
  running: false,
}))
