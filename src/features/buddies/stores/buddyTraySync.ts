import { create } from 'zustand'

export const useBuddyTraySync = create<{
  syncing: boolean

  failedAt: number | null
}>()(() => ({ syncing: false, failedAt: null }))
