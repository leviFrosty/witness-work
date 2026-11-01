import useBuddiesAvailability from '@/features/buddies/hooks/useBuddiesAvailability'

export default function useBuddiesEnabled(): boolean {
  return useBuddiesAvailability() !== 'hidden'
}
