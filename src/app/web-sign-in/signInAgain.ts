import { create } from 'zustand'
import { analytics } from '@/lib/analytics'
import type { SensitiveAction } from '@/lib/serverAccount/stepUp'

/**
 * Sign In Again (docs/passkeys-protocol.md, "Step-up on the web"): a signed-in
 * browser whose step-up can't pass (no passkey, or none of the account's here)
 * signs in once more with a recovery key, a phone or a passkey. The new session
 * opens a new 5-minute window, so the action (adding the first passkey here,
 * say) can go ahead. The data stays: it's the same account's. Web only;
 * `WebSignInGate` shows the sign-in screen while it's open.
 */
export const useSignInAgain = create<{ open: boolean }>(() => ({
  open: false,
}))

/** Opens the sign-in screen over the app, for the step-up's `action`. */
export function startSignInAgain(action: SensitiveAction) {
  analytics.capture('web_sign_in_again', { action })
  useSignInAgain.setState({ open: true })
}

/** Back to the app: signed in again, or the User went back. */
export const endSignInAgain = () => useSignInAgain.setState({ open: false })
