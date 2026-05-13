import { create } from 'zustand'

/**
 * Ephemeral mirror of `useIsSupporter()` so non-React code (widget snapshot
 * writer, iCloud sync gate, etc.) can read supporter status synchronously
 * without round-tripping through `CustomerContext` or recomputing from
 * RevenueCat. Not persisted — `App` resets it on boot and rewrites whenever
 * entitlements or `devSupporterOverride` change via `SupporterStoreSync`.
 */
type SupporterState = {
  isSupporter: boolean
  setSupporter: (isSupporter: boolean) => void
}

export const useSupporter = create<SupporterState>((set) => ({
  isSupporter: false,
  setSupporter: (isSupporter) => set({ isSupporter }),
}))
