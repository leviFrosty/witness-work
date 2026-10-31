import { useSyncExternalStore } from 'react'

/**
 * The account's RevenueCat id once this browser has pulled the account's sync
 * data and settled it (ADR 0040 §7, docs/web-purchases.md "Buy waits for a
 * settled id"), or null until then. Web Buy waits for it outside development
 * builds, and buys only as this id.
 *
 * TODO(W6 part 2): the web pulls Cloud Sync, and the ADR 0040 §7 claim settles
 * the id; subscribe to that here. Until then nothing settles it, so Beta and
 * production show no Buy.
 */
const subscribe = (_onChange: () => void) => () => {}
const settledId = (): string | null => null

export const useSettledWebRevenueCatId = (): string | null =>
  useSyncExternalStore(subscribe, settledId, settledId)
