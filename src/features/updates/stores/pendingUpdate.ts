import { create } from 'zustand'

type PendingUpdateStore = {
  bundleId: string | null
}

export const usePendingUpdate = create<PendingUpdateStore>(() => ({
  bundleId: null,
}))
