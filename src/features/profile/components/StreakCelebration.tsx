import { useEffect } from 'react'
import useServiceStreak from '@/hooks/useServiceStreak'
import useTakeoverTurn from '@/hooks/useTakeoverTurn'
import { analytics } from '@/lib/analytics'
import Haptics from '@/lib/haptics'
import { isStreakMilestone, nextSeenStreak } from '@/lib/serviceStreak'
import { actionBehind, celebrationClaim } from '@/lib/userAction'
import StreakCelebrationOverlay from '@/features/profile/components/StreakCelebrationOverlay'
import { useStreakCelebration } from '@/features/profile/stores/streakCelebration'

/** Lets Add Time close before anything plays. */
const AFTER_SAVE_MS = 900

/**
 * The overlay closes itself after about 4 s; if it somehow doesn't, the
 * takeover arbiter lets the screen go after this long.
 */
const MAX_ON_SCREEN_MS = 15_000

/**
 * Watches the Service Streak and marks it growing, once per device. A milestone
 * the User's own action just reached (Add Time, the timer, the checkbox) plays
 * the full celebration when the takeover arbiter gives it a turn (ADR 0021).
 * Any other growth, a milestone from elsewhere (Siri, the Watch, another
 * device), or one whose moment passed while it waited, flares the Home chip
 * instead. HomeTabStack mounts the single instance.
 */
export default function StreakCelebration() {
  const { kind, count, latest } = useServiceStreak()
  const celebrating = useStreakCelebration((state) => state.celebrating)
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
    if (!next.grew) {
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

  // Its moment passed while it waited (or another celebration of the same
  // action went first): the chip flares instead.
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
