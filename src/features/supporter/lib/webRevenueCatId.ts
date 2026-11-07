import { useSyncExternalStore } from 'react'
import {
  onSettledRevenueCatIdChange,
  settledRevenueCatId,
} from '@/lib/settledRevenueCatId'

export const useSettledWebRevenueCatId = (): string | null =>
  useSyncExternalStore(
    onSettledRevenueCatIdChange,
    settledRevenueCatId,
    settledRevenueCatId
  )
