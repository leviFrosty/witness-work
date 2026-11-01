import { useEffect, useRef, useState } from 'react'
import type { TakeoverKind } from '@/lib/takeover/arbiter'
import { newTakeoverId, useTakeover } from '@/stores/takeover'

export type TakeoverTurnStatus = 'idle' | 'waiting' | 'active' | 'expired'

export type TakeoverTurnOptions = {
  expiresAt?: number

  dropOnBackground?: boolean

  ignoresHolds?: boolean

  group?: string

  maxActiveMs?: number
}

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

export function useTakeoverHold(reason: string, on: boolean) {
  useEffect(() => {
    if (!on) return
    useTakeover.getState().hold(reason)
    return () => useTakeover.getState().unhold(reason)
  }, [reason, on])
}

export function useIsTakingOver() {
  return useTakeover((state) => state.arbiter.active !== null)
}
