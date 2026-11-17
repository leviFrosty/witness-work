import { useEffect, useState } from 'react'
import { analytics } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import {
  buddiesOnTheirWay,
  joinBuddiesHere,
} from '@/app/buddies/joinBuddiesHere'

export type BuddiesOnTheirWayState = 'checking' | 'onTheirWay' | 'no'

const WAIT_MS = 60_000
const CHECK_TIMEOUT_MS = 5_000

export default function useBuddiesOnTheirWay(): BuddiesOnTheirWayState {
  const needsOnboarding = useBuddies((state) => !state.onboardingComplete)
  const [state, setState] = useState<BuddiesOnTheirWayState>('checking')

  useEffect(() => {
    if (!needsOnboarding) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), CHECK_TIMEOUT_MS)
    })
    void Promise.race([buddiesOnTheirWay(), timeout]).then((onTheirWay) => {
      clearTimeout(timer)
      if (cancelled) return
      setState(onTheirWay ? 'onTheirWay' : 'no')
      if (!onTheirWay) return
      analytics.capture('buddies_restoring_shown')
      void joinBuddiesHere().catch((error: unknown) =>
        logger.warn('[buddies] join while restoring', error)
      )
      timer = setTimeout(() => {
        if (!cancelled) setState('no')
      }, WAIT_MS)
    })
    return () => {
      cancelled = true
      clearTimeout(timer)
      setState('checking')
    }
  }, [needsOnboarding])

  return needsOnboarding ? state : 'no'
}
