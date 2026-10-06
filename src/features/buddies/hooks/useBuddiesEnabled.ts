import useBuddiesAvailability from '@/features/buddies/hooks/useBuddiesAvailability'

/**
 * Whether Buddies shows at all. Stays on while flags reload or can't load and
 * while the relay is turned off, so its markers, pickers, and background work
 * don't flicker; `useBuddiesAvailability` tells those states apart.
 */
export default function useBuddiesEnabled(): boolean {
  return useBuddiesAvailability() !== 'hidden'
}
