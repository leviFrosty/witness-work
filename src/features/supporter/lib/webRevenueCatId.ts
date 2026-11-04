import { useSyncExternalStore } from 'react'
import {
  onSettledRevenueCatIdChange,
  settledRevenueCatId,
} from '@/lib/settledRevenueCatId'

/**
 * The account's RevenueCat id once this browser has pulled the account's sync
 * data in full and `AccountProvider` has settled it (ADR 0040 §7,
 * docs/web-purchases.md "Buy waits for a settled id"), or null until then. Web
 * Buy waits for it outside development builds, and buys only as this id.
 */
export const useSettledWebRevenueCatId = (): string | null =>
  useSyncExternalStore(
    onSettledRevenueCatIdChange,
    settledRevenueCatId,
    settledRevenueCatId
  )
