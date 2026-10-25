import { create } from 'zustand'

/**
 * An OTA update downloaded this launch that the app isn't running yet. Not
 * persisted: the next cold launch runs it, so it's no longer pending.
 */
type PendingUpdateStore = {
  /** The staged artifact's bundle id (`builtin` for a rollback), or null. */
  bundleId: string | null
}

export const usePendingUpdate = create<PendingUpdateStore>(() => ({
  bundleId: null,
}))
