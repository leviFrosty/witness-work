import { useEffect, useState } from 'react'
import useBuddiesAvailability from '@/features/buddies/hooks/useBuddiesAvailability'

/**
 * Whether onboarding offers its Buddies step: Buddies shows on this device (a
 * binary with the Buddies key module and the `buddies` flag on; see
 * `useBuddiesAvailability`). That includes `loading`, which only happens when
 * the flag was on at its last load. A fresh install's flag settles during the
 * first screens, so the step joins the flow ahead of the user. Once they reach
 * the step's place (`reached`), the answer holds for the rest of onboarding: a
 * flag that loads, reloads, or changes later never adds or removes a step
 * behind them.
 */
export default function useOnboardingBuddiesAvailable(
  reached: boolean
): boolean {
  const live = useBuddiesAvailability() !== 'hidden'
  const [held, setHeld] = useState<boolean | null>(null)

  useEffect(() => {
    if (reached && held === null) setHeld(live)
  }, [reached, held, live])

  return held ?? live
}
