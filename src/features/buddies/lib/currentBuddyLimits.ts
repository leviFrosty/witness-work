import {
  type BuddyLimits,
  resolveBuddyLimits,
} from '@/features/buddies/lib/limits'
import { useServerBuddyLimits } from '@/stores/serverBuddyLimits'

export const currentBuddyLimits = (): BuddyLimits =>
  resolveBuddyLimits(useServerBuddyLimits.getState().limits)

export const useBuddyLimits = (): BuddyLimits =>
  resolveBuddyLimits(useServerBuddyLimits((state) => state.limits))
