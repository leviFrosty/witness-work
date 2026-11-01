import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  endHandoff,
  type HandoffEndReason,
  type HandoffEntry,
  startOfferHandoff,
} from '@/app/account/handoff'
import { addForegroundListener } from '@/lib/appLifecycle'
import { logger } from '@/lib/logger'
import type { OfferSession } from '@/lib/serverAccount/handoffSession'
import {
  useHandoffPolling,
  useHandoffState,
} from '@/features/settings/hooks/useHandoffSession'
import {
  type HandoffStart,
  handoffEnding,
} from '@/features/settings/components/account/handoff/handoffEnding'

export default function useOfferHandoff(
  entry: HandoffEntry,

  params?: object
) {
  const [start, setStart] = useState<HandoffStart>({ phase: 'starting' })
  const [attempt, setAttempt] = useState(0)

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

  const newCode = () => {
    endReason.current = 'new_code'
    setAttempt((count) => count + 1)
  }

  const ending = useRef<'retry' | 'final' | null>(null)
  const current = handoffEnding(start, state)
  useEffect(() => {
    ending.current = current
  }, [current])

  const focusedBefore = useRef(false)
  useFocusEffect(
    useCallback(() => {
      const startAgain = () => {
        endReason.current = 'new_code'
        setAttempt((count) => count + 1)
      }
      if (focusedBefore.current && ending.current) startAgain()
      focusedBefore.current = true
      const foreground = addForegroundListener(() => {
        if (ending.current === 'retry') startAgain()
      })
      return () => foreground.remove()
    }, [])
  )

  const shownParams = useRef(params)
  useEffect(() => {
    if (shownParams.current === params) return
    shownParams.current = params
    if (!ending.current) return
    endReason.current = 'new_code'
    setAttempt((count) => count + 1)
  }, [params])

  return { start, session, state, newCode }
}
