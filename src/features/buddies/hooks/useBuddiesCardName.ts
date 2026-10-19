import { useProfile } from '@/stores/profile'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * The name buddies see on this User's Buddy Card: the account's, which every
 * device's card carries, else this device's Profile name, which stands in until
 * one is known (see `cardName` in the engine).
 */
export default function useBuddiesCardName(): string {
  const accountName = useBuddies((state) => state.cardName?.name)
  const profileName = useProfile((state) => state.name.trim())
  return accountName || profileName
}
