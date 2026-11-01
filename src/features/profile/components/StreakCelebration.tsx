import { type ComponentProps, useEffect } from 'react'
import useServiceStreak from '@/hooks/useServiceStreak'
import useTakeoverTurn from '@/hooks/useTakeoverTurn'
import { analytics } from '@/lib/analytics'
import Haptics from '@/lib/haptics'
import { isStreakMilestone, nextSeenStreak } from '@/lib/serviceStreak'
import { actionBehind, celebrationClaim } from '@/lib/userAction'
import type StreakCelebrationOverlayComponent from '@/features/profile/components/StreakCelebrationOverlay'
import { useStreakCelebration } from '@/features/profile/stores/streakCelebration'
import { usePreferences } from '@/stores/preferences'

const AFTER_SAVE_MS = 900

const MAX_ON_SCREEN_MS = 15_000

export default function StreakCelebration() {
  const { kind, count, latest } = useServiceStreak()
  const celebrating = useStreakCelebration((state) => state.celebrating)
  const showStreaks = usePreferences((state) => state.showStreaks)
  const turn = useTakeoverTurn(
    'streak-celebration',
    celebrating !== null,
    celebrating?.claim
      ? {
          expiresAt: celebrating.claim.expiresAt,
          group: celebrating.claim.group,
          dropOnBackground: true,
          maxActiveMs: MAX_ON_SCREEN_MS,
        }
      : { maxActiveMs: MAX_ON_SCREEN_MS }
  )

  useEffect(() => {
    const { seen } = useStreakCelebration.getState()
    const next = nextSeenStreak(seen, { kind, count, latest }, new Date())
    if (!next.grew || !usePreferences.getState().showStreaks) {
      if (next.seen !== seen) useStreakCelebration.setState({ seen: next.seen })
      return
    }
    const grewAt = Date.now()
    const timer = setTimeout(() => {
      const action = actionBehind(grewAt)
      if (isStreakMilestone(kind, count)) {
        analytics.capture('streak_milestone_reached', {
          count,
          kind,
          after_action: action !== null,
        })
      }
      if (isStreakMilestone(kind, count) && action) {
        useStreakCelebration.setState({
          seen: next.seen,
          celebrating: { count, kind, claim: celebrationClaim(action) },
        })
      } else {
        useStreakCelebration.setState({ seen: next.seen, grewAt: Date.now() })
        void Haptics.light().catch(() => {})
      }
    }, AFTER_SAVE_MS)
    return () => clearTimeout(timer)
  }, [kind, count, latest])

  useEffect(() => {
    if (!showStreaks) useStreakCelebration.setState({ celebrating: null })
  }, [showStreaks])

  useEffect(() => {
    if (turn.status !== 'expired') return
    useStreakCelebration.setState({ celebrating: null, grewAt: Date.now() })
  }, [turn.status])

  if (!celebrating || !turn.active) return null
  return (
    <StreakCelebrationOverlay
      key={`${celebrating.kind}:${celebrating.count}`}
      count={celebrating.count}
      kind={celebrating.kind}
      onDone={() => useStreakCelebration.setState({ celebrating: null })}
    />
  )
}

function StreakCelebrationOverlay(
  props: ComponentProps<typeof StreakCelebrationOverlayComponent>
) {
  const Overlay: typeof StreakCelebrationOverlayComponent =
    require('@/features/profile/components/StreakCelebrationOverlay').default
  return <Overlay {...props} />
}
