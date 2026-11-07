import { useEffect, useState } from 'react'
import { readPasskeyOffer } from '@/app/account/passkeyOffer'
import { analytics } from '@/lib/analytics'
import { onAccountChange } from '@/lib/serverAccount'
import { usePreferences } from '@/stores/preferences'

export default function useOnboardingPasskeysAvailable(
  reached: boolean
): boolean {
  const [live, setLive] = useState(false)
  const [held, setHeld] = useState<boolean | null>(() =>
    reached
      ? usePreferences.getState().onboardingPasskeysOffered === true
      : null
  )

  useEffect(() => {
    if (held !== null) return
    let current = true
    const check = () =>
      void readPasskeyOffer().then((offer) => {
        if (current) setLive(offer === 'offer')
      })
    check()
    const unsubscribe = onAccountChange(check)
    return () => {
      current = false
      unsubscribe()
    }
  }, [held])

  useEffect(() => {
    if (!reached || held !== null) return
    setHeld(live)
    usePreferences.getState().set({ onboardingPasskeysOffered: live })
    if (live) analytics.capture('passkey_onboarding_shown')
  }, [reached, held, live])

  return held ?? live
}
