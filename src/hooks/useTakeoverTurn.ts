import { useEffect, useRef, useState } from 'react'
import type { TakeoverKind } from '@/lib/takeover/arbiter'
import { newTakeoverId, useTakeover } from '@/stores/takeover'

export type TakeoverTurnStatus = 'idle' | 'waiting' | 'active' | 'expired'

export type TakeoverTurnOptions = {
  /** Dropped unshown after this time (epoch ms): a celebration's window. */
  expiresAt?: number
  /** Dropped unshown if the app goes to the background first. */
  dropOnBackground?: boolean
  /** Asked for by the User themselves: shows even while the screen is held. */
  ignoresHolds?: boolean
  /** One grant per group (one celebration per action). */
  group?: string
  /** Released after this long on screen, in case it never closes itself. */
  maxActiveMs?: number
}

/**
 * Asks the takeover arbiter for a turn while `want` is true, and gives it back
 * when `want` turns false or the component unmounts. Render the takeover only
 * while `active`. A claim that expires unshown reports `expired`: fall back to
 * the quiet version, then stop wanting it.
 *
 * The options are read when the request is made; changing them later doesn't
 * re-request (that would give up a turn already on screen).
 */
export default function useTakeoverTurn(
  kind: TakeoverKind,
  want: boolean,
  options: TakeoverTurnOptions = {}
): { active: boolean; status: TakeoverTurnStatus } {
  const [id] = useState(() => newTakeoverId(kind))
  const latestOptions = useRef(options)
  useEffect(() => {
    latestOptions.current = options
  })
  const status = useTakeover((state): TakeoverTurnStatus => {
    const { active, queue, expired } = state.arbiter
    if (active?.id === id) return 'active'
    if (expired.includes(id)) return 'expired'
    return queue.some((claim) => claim.id === id) ? 'waiting' : 'idle'
  })

  useEffect(() => {
    if (!want) return
    const { dropOnBackground, ...rest } = latestOptions.current
    useTakeover.getState().request(kind, {
      ...rest,
      id,
      ...(dropOnBackground ? { expiresOnHold: ['background'] } : {}),
    })
    return () => useTakeover.getState().release(id)
  }, [id, kind, want])

  return { active: status === 'active', status }
}

/**
 * Holds every takeover off while `on`: something covers the tabs (a sheet, a
 * popover, the profile overlay) or the app isn't in front. `reason` must be
 * unique to its holder; add `useId()` for components mounted more than once.
 */
export function useTakeoverHold(reason: string, on: boolean) {
  useEffect(() => {
    if (!on) return
    useTakeover.getState().hold(reason)
    return () => useTakeover.getState().unhold(reason)
  }, [reason, on])
}

/** Whether a takeover is on screen right now. */
export function useIsTakingOver() {
  return useTakeover((state) => state.arbiter.active !== null)
}
