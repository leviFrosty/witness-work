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

/**
 * The old phone's handoff for Set Up Another Device: starts one when the screen
 * opens (and again for a new code), polls while it waits on the other phone,
 * and cancels the channel when the screen closes. Once it has ended, coming
 * back to the screen (from a screen on top of it, or navigated to again) starts
 * a new one, and so does returning to the app unless it succeeded or can't
 * succeed, which stays up until the User leaves.
 */
export default function useOfferHandoff(
  entry: HandoffEntry,
  /** The route's params; a new object means the screen was navigated to again. */
  params?: object
) {
  const [start, setStart] = useState<HandoffStart>({ phase: 'starting' })
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

  // Read by the listeners below, which only act on a return to the screen.
  const ending = useRef<'retry' | 'final' | null>(null)
  const current = handoffEnding(start, state)
  useEffect(() => {
    ending.current = current
  }, [current])

  // Coming back to the screen. Its first focus is the opening, which already
  // started one.
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

  // Navigated to again while it's showing: React Navigation keeps the screen.
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
