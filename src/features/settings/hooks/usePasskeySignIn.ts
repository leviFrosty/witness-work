import { useEffect, useRef, useState } from 'react'
import {
  holdPasskeySignIn,
  type PasskeySignInEntry,
  type PhonePasskeyOutcome,
  signInWithPhonePasskey,
  type WaitingPasskey,
} from '@/app/account/passkeySignIn'
import { logger } from '@/lib/logger'
import { toast } from '@/stores/toasts'
import i18n from '@/lib/locales'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { confirmAccountReplace } from '@/features/settings/components/account/confirmAccountReplace'
import { passkeySignInFailureText } from '@/features/settings/components/account/passkeySignIn/passkeySignInCopy'

/**
 * Sign In with a Passkey's screen state. Failures that a new try or another way
 * can fix show as an error toast over the choices; this phone being
 * unverifiable stays on screen. The passkey that couldn't unlock is kept while
 * the screen shows, and comes back as "Finish signing in" when trying another
 * one is cancelled or fails.
 */
export default function usePasskeySignIn(entry: PasskeySignInEntry) {
  const buddiesEnabled = useBuddiesEnabled()
  const [outcome, setOutcome] = useState<
    'choices' | 'running' | PhonePasskeyOutcome
  >('choices')
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const release = holdPasskeySignIn()
    return () => {
      mounted.current = false
      release()
    }
  }, [])

  const start = async () => {
    if (outcome === 'running') return
    setOutcome('running')
    const result = await signInWithPhonePasskey({
      entry,
      confirmReplace: (loss) => confirmAccountReplace(loss, 'handoff'),
      buddiesEnabled,
    }).catch((error: unknown): PhonePasskeyOutcome => {
      logger.warn('[passkeys] sign-in failed', error)
      return {
        status: 'failed',
        reason: 'failed',
        serverReason: null,
        retryAfterMs: null,
        waiting: null,
      }
    })
    if (!mounted.current) return
    const settled = (waiting: WaitingPasskey | null) =>
      setOutcome(waiting ? { status: 'cantUnlock', ...waiting } : 'choices')
    if (result.status === 'cancelled') return settled(result.waiting)
    if (result.status === 'failed' && result.reason !== 'unverified') {
      toast.error(i18n.t('handoff_failedTitle'), {
        message: passkeySignInFailureText(result.reason, result),
      })
      return settled(result.waiting)
    }
    setOutcome(result)
  }

  return { outcome, start, back: () => setOutcome('choices') }
}
