import { useEffect, useRef, useState } from 'react'
import {
  endHandoff,
  type HandoffEndReason,
  type HandoffEntry,
  type OfferStartProblem,
  startOfferHandoff,
} from '@/app/account/handoff'
import { logger } from '@/lib/logger'
import type { OfferSession } from '@/lib/serverAccount/handoffSession'
import {
  useHandoffPolling,
  useHandoffState,
} from '@/features/settings/hooks/useHandoffSession'

type Start =
  | { phase: 'starting' }
  | { phase: 'problem'; problem: OfferStartProblem }
  | { phase: 'ready'; session: OfferSession }

/**
 * The old phone's handoff for Set Up Another Device: starts one when the screen
 * opens (and again for a new code), polls while it waits on the other phone,
 * and cancels the channel when the screen closes.
 */
export default function useOfferHandoff(entry: HandoffEntry) {
  const [start, setStart] = useState<Start>({ phase: 'starting' })
  const [attempt, setAttempt] = useState(0)
  /** Why the current session ends when this effect cleans up. */
  const endReason = useRef<HandoffEndReason>('left')

  useEffect(() => {
    let live = true
    let session: OfferSession | null = null
    endReason.current = 'left'
    setStart({ phase: 'starting' })
    startOfferHandoff(entry)
      .then((result) => {
        if (!result.ok) {
          if (live) setStart({ phase: 'problem', problem: result.problem })
          return
        }
        session = result.session
        if (live) setStart({ phase: 'ready', session })
        else void endHandoff(session, endReason.current)
      })
      .catch((error: unknown) => {
        logger.warn('[handoff] starting failed', error)
        if (live) setStart({ phase: 'problem', problem: 'offline' })
      })
    return () => {
      live = false
      if (session) void endHandoff(session, endReason.current)
    }
  }, [entry, attempt])

  const session = start.phase === 'ready' ? start.session : null
  const state = useHandoffState(session)
  useHandoffPolling(
    session,
    state?.step === 'waiting' || state?.step === 'sent'
  )

  /** Ends this code and shows a new one. */
  const newCode = () => {
    endReason.current = 'new_code'
    setAttempt((count) => count + 1)
  }

  return { start, session, state, newCode }
}
