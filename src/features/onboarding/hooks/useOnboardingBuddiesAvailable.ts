import useBuddiesAvailability from '@/features/buddies/hooks/useBuddiesAvailability'
import useAttestationSupport from '@/features/settings/hooks/useAttestationSupport'

/**
 * Whether onboarding's tour shows Buddies: Buddies shows on this device (a
 * binary with the Buddies key module and the `buddies` flag on; see
 * `useBuddiesAvailability`), and the device can attest, since Buddies needs an
 * attested account session (ADR 0027). That includes `loading`, which only
 * happens when the flag was on at its last load, and a support check still
 * running. The tour holds its pages from the first swipe, so a flag that
 * settles later never changes a page under the user.
 */
export default function useOnboardingBuddiesAvailable(): boolean {
  const shown = useBuddiesAvailability() !== 'hidden'
  const support = useAttestationSupport()
  return shown && support !== 'unsupported'
}
