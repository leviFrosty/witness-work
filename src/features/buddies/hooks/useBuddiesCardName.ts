import { useProfile } from '@/stores/profile'

export default function useBuddiesCardName(): string {
  return useProfile((state) => state.name.trim())
}
