import * as BuddiesKeychain from '../../../../modules/buddies-keychain'
import {
  buddiesAvailability,
  type BuddiesAvailability,
} from '@/features/buddies/lib/availability'
import { useBuddiesSession } from '@/features/buddies/stores/buddiesSession'

export default function useBuddiesAvailability(): BuddiesAvailability {
  const relayDisabled = useBuddiesSession((state) => state.relayDisabled)
  return buddiesAvailability({
    nativeAvailable: BuddiesKeychain.isAvailable(),
    relayDisabled,
  })
}
