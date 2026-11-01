import { useEffect, useState } from 'react'
import useBuddiesAvailability from '@/features/buddies/hooks/useBuddiesAvailability'
import useAttestationSupport from '@/features/settings/hooks/useAttestationSupport'

export default function useOnboardingBuddiesAvailable(
  reached: boolean
): boolean {
  const shown = useBuddiesAvailability() !== 'hidden'
  const support = useAttestationSupport()
  const live = shown && support !== 'unsupported'
  const [held, setHeld] = useState<boolean | null>(null)

  useEffect(() => {
    if (reached && held === null) setHeld(live)
  }, [reached, held, live])

  return held ?? live
}
