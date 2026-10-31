import { useEffect, useState } from 'react'
import { readPasskeyOffer } from '@/app/account/passkeyOffer'
import { analytics } from '@/lib/analytics'
import { onAccountChange } from '@/lib/serverAccount'
import { usePreferences } from '@/stores/preferences'

/**
 * Whether onboarding offers its Save a Passkey step: this phone makes passkeys,
 * the account exists, and it has none (`readPasskeyOffer`). New installs have
 * no account yet, as the key waits for onboarding to end, so it shows for those
 * whose account came first: a restore or QR sign-in, or an invite made in the
 * Buddies step (a session opening checks again). New installs get the tray's
 * gentle prompt when onboarding ends instead (`completeGuidedOnboarding`).
 *
 * Once they reach the step's place (`reached`), the answer holds for the rest
 * of onboarding, so a check that finishes later never adds or removes a step
 * behind them. It's saved (`onboardingPasskeysOffered`), because Android may
 * recreate the app behind the system's passkey sheet: a relaunch at or past the
 * step uses what was decided, rather than guessing, and starts from "no" when
 * nothing was.
 */
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
