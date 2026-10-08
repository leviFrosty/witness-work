import { useEffect } from 'react'
import useServiceStreak from '@/hooks/useServiceStreak'
import { analytics } from '@/lib/analytics'
import Haptics from '@/lib/haptics'
import { isStreakMilestone, nextSeenStreak } from '@/lib/serviceStreak'
import StreakCelebrationOverlay from '@/features/profile/components/StreakCelebrationOverlay'
import { useStreakCelebration } from '@/features/profile/stores/streakCelebration'

/** Lets Add Time close before anything plays. */
const AFTER_SAVE_MS = 900

/**
 * Watches the Service Streak and marks it growing: the full celebration at a
 * milestone, a flare of the Home chip otherwise. Growth from any path counts
 * (Add Time, the timer, the checkbox, Siri, another device), once per device.
 * HomeTabStack mounts the single instance.
 */
export default function StreakCelebration() {
  const { kind, count, latest } = useServiceStreak()
  const celebrating = useStreakCelebration((state) => state.celebrating)

  useEffect(() => {
    const { seen } = useStreakCelebration.getState()
    const next = nextSeenStreak(seen, { kind, count, latest }, new Date())
    if (!next.grew) {
      if (next.seen !== seen) useStreakCelebration.setState({ seen: next.seen })
      return
    }
    const timer = setTimeout(() => {
      if (isStreakMilestone(kind, count)) {
        useStreakCelebration.setState({
          seen: next.seen,
          celebrating: { count, kind },
        })
        analytics.capture('streak_milestone_reached', { count, kind })
      } else {
        useStreakCelebration.setState({ seen: next.seen, grewAt: Date.now() })
        void Haptics.light().catch(() => {})
      }
    }, AFTER_SAVE_MS)
    return () => clearTimeout(timer)
  }, [kind, count, latest])

  if (!celebrating) return null
  return (
    <StreakCelebrationOverlay
      key={`${celebrating.kind}:${celebrating.count}`}
      count={celebrating.count}
      kind={celebrating.kind}
      onDone={() => useStreakCelebration.setState({ celebrating: null })}
    />
  )
}
