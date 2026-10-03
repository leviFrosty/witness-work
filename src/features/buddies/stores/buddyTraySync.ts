import { create } from 'zustand'

/**
 * How the last Buddies check the notifications tray asked for went. In memory
 * only: a fresh launch starts idle and checks again when the tray opens.
 */
export const useBuddyTraySync = create<{
  syncing: boolean
  /** When the last check failed; cleared by any later successful sync. */
  failedAt: number | null
}>()(() => ({ syncing: false, failedAt: null }))
