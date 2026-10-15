import { useEffect, useRef, useState } from 'react'
import {
  type ClaimCompletion,
  completeClaimHandoff,
  endHandoff,
  type HandoffEntry,
  startClaimHandoff,
} from '@/app/account/handoff'
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

/** Cancels a session that's still waiting for the key. */
function endIfActive(session: ClaimSession | null) {
  if (session && ACTIVE_STEPS.has(session.state.step))
    void endHandoff(session, 'left')
}

/**
 * The new phone's handoff for Sign In with QR Code: claims the code it's given
 * (scanned, or an opened link), polls until the old phone sends the account,
 * then checks and stores it. Leaving before the key arrives cancels.
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
  const state = useHandoffState(session)

  const begin = (offer: HandoffOffer, how: HandoffEntry) => {
    endIfActive(current.current)
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
    endIfActive(current.current)
    const next = startClaimHandoff(parsed.offer, entry)
    current.current = next
    setLinkProblem(null)
    setCompletion('idle')
    setSession(next)
  }, [link, entry])

  // Leaving the screen before the key arrives cancels the channel.
  useEffect(() => {
    const latest = current
    return () => endIfActive(latest.current)
  }, [])

  useHandoffPolling(session, state?.step === 'waiting')

  useEffect(() => {
    if (!session || state?.step !== 'received' || completion !== 'idle') return
    setCompletion('running')
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
  }, [session, state?.step, completion, buddiesEnabled])

  /** Back to the scanner. */
  const reset = () => {
    endIfActive(current.current)
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
    reset,
  }
}
