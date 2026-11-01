import { useProfile } from '@/stores/profile'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export default function useBuddiesCardName(): string {
  const accountName = useBuddies((state) => state.cardName?.name)
  const profileName = useProfile((state) => state.name.trim())
  return accountName || profileName
}
