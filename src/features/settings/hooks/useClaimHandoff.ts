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

function endIfActive(
  session: ClaimSession | null,
  completing: ClaimSession | null
) {
  if (!session) return
  const step = session.state.step
  if (ACTIVE_STEPS.has(step) || (step === 'received' && completing !== session))
    void endHandoff(session, 'left')
}

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

  const completing = useRef<ClaimSession | null>(null)
  const state = useHandoffState(session)

  const begin = (offer: HandoffOffer, how: HandoffEntry) => {
    endIfActive(current.current, completing.current)
    const next = startClaimHandoff(offer, how)
    current.current = next
    setLinkProblem(null)
    setCompletion('idle')
    setSession(next)
  }

  useEffect(() => {
    if (!link) return
    const parsed = parseHandoffLink(link)
    if (!parsed.ok) {
      setLinkProblem(parsed.problem)
      return
    }

    if (current.current?.channelId === parsed.offer.channelId) return
    endIfActive(current.current, completing.current)
    const next = startClaimHandoff(parsed.offer, entry)
    current.current = next
    setLinkProblem(null)
    setCompletion('idle')
    setSession(next)
  }, [link, entry])

  useEffect(() => {
    const latest = current
    const running = completing
    return () => endIfActive(latest.current, running.current)
  }, [])

  useHandoffPolling(session, state?.step === 'waiting')

  useEffect(() => {
    if (!session || state?.step !== 'received' || completion !== 'idle') return
    setCompletion('running')
    completing.current = session
    completeClaimHandoff(session, {
      confirmReplace: (loss) => confirmAccountReplace(loss, 'handoff'),
      buddiesEnabled,
    })
      .catch((error: unknown): ClaimCompletion => {
        logger.warn('[handoff] completing failed', error)
        session.fail('server')
        return { outcome: 'failed', reason: 'server' }
      })
      .then((outcome) => {
        if (completing.current === session) completing.current = null

        if (current.current !== session) endIfActive(session, null)
        else setCompletion(outcome)
      })
  }, [session, state?.step, completion, buddiesEnabled])

  const retryable =
    typeof completion === 'object' &&
    completion.outcome === 'failed' &&
    completion.retryable === true

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
