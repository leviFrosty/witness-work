import { useEffect, useRef, useState } from 'react'
import {
  type ClaimCompletion,
  completeClaimHandoff,
  endHandoff,
  type HandoffEntry,
  startClaimHandoff,
} from '@/app/account/handoff'
import { addReconnectListener } from '@/lib/http/online'
import { logger } from '@/lib/logger'
import {
  type HandoffOffer,
  parseHandoffLink,
  type ParsedHandoffLink,
} from '@/lib/serverAccount/handoff'
import type { ClaimSession } from '@/lib/serverAccount/handoffSession'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { confirmAccountReplace } from '@/features/settings/components/account/confirmAccountReplace'
import {
  useHandoffPolling,
  useHandoffState,
} from '@/features/settings/hooks/useHandoffSession'

type LinkProblem = Extract<ParsedHandoffLink, { ok: false }>['problem']

const ACTIVE_STEPS = new Set(['idle', 'claiming', 'waiting'])

/**
 * Cancels a session that's still waiting for the key, or holds one it couldn't
 * use yet (`received` while nothing is completing it).
 */
function endIfActive(session: ClaimSession | null, completing: boolean) {
  if (!session) return
  const step = session.state.step
  if (ACTIVE_STEPS.has(step) || (step === 'received' && !completing))
    void endHandoff(session, 'left')
}

/**
 * The new phone's handoff for Sign In with QR Code: claims the code it's given
 * (scanned, or an opened link), polls until the old phone sends the account,
 * then checks and stores it. Signing in with the key that failed for now
 * (offline, a server error) runs again from Try Again or when the connection
 * comes back. Leaving before the key is stored cancels.
 */
export default function useClaimHandoff(
  entry: HandoffEntry,
  link: string | undefined
) {
  const buddiesEnabled = useBuddiesEnabled()
  const [session, setSession] = useState<ClaimSession | null>(null)
  const [linkProblem, setLinkProblem] = useState<LinkProblem | null>(null)
  const [completion, setCompletion] = useState<
    'idle' | 'running' | ClaimCompletion
  >('idle')
  const current = useRef<ClaimSession | null>(null)
  /** Whether `completeClaimHandoff` is running, read when the screen closes. */
  const completing = useRef(false)
  const state = useHandoffState(session)

  const begin = (offer: HandoffOffer, how: HandoffEntry) => {
    endIfActive(current.current, completing.current)
    const next = startClaimHandoff(offer, how)
    current.current = next
    setLinkProblem(null)
    setCompletion('idle')
    setSession(next)
  }

  // An opened link (from the system camera or the Tools) starts at once.
  useEffect(() => {
    if (!link) return
    const parsed = parseHandoffLink(link)
    if (!parsed.ok) {
      setLinkProblem(parsed.problem)
      return
    }
    // The same code again (a link opened twice) keeps the claim going.
    if (current.current?.channelId === parsed.offer.channelId) return
    endIfActive(current.current, completing.current)
    const next = startClaimHandoff(parsed.offer, entry)
    current.current = next
    setLinkProblem(null)
    setCompletion('idle')
    setSession(next)
  }, [link, entry])

  // Leaving the screen before the key arrives cancels the channel.
  useEffect(() => {
    const latest = current
    const running = completing
    return () => endIfActive(latest.current, running.current)
  }, [])

  useHandoffPolling(session, state?.step === 'waiting')

  useEffect(() => {
    if (!session || state?.step !== 'received' || completion !== 'idle') return
    setCompletion('running')
    completing.current = true
    completeClaimHandoff(session, {
      confirmReplace: (loss) => confirmAccountReplace(loss, 'handoff'),
      buddiesEnabled,
    })
      .then(setCompletion)
      .catch((error: unknown) => {
        logger.warn('[handoff] completing failed', error)
        session.fail('server')
        setCompletion({ outcome: 'failed', reason: 'server' })
      })
      .finally(() => {
        completing.current = false
      })
  }, [session, state?.step, completion, buddiesEnabled])

  const retryable =
    typeof completion === 'object' &&
    completion.outcome === 'failed' &&
    completion.retryable === true

  /** Signs in with the received key again. */
  const retry = () => {
    if (current.current?.state.step === 'received') setCompletion('idle')
  }

  useEffect(() => {
    if (!retryable) return
    const reconnect = addReconnectListener(() => {
      if (current.current?.state.step === 'received') setCompletion('idle')
    })
    return () => reconnect.remove()
  }, [retryable])

  /** Back to the scanner. */
  const reset = () => {
    endIfActive(current.current, completing.current)
    current.current = null
    setSession(null)
    setLinkProblem(null)
    setCompletion('idle')
  }

  return {
    session,
    state,
    linkProblem,
    completion,
    scanned: (offer: HandoffOffer) => begin(offer, entry),
    retry,
    reset,
  }
}
