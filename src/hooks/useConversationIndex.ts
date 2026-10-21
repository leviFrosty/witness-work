import { useEffect, useState } from 'react'
import { addForegroundListener } from '@/lib/appLifecycle'
import { buildConversationIndex } from '@/lib/conversationIndex'
import { StalenessBreakpoints } from '@/types/staleness'
import { Visit } from '@/types/visit'

/** A beat past the boundary, so the rebuild lands on the far side of it. */
const SLACK_MS = 1000

const nextMidnightMs = (nowMs: number) => {
  const next = new Date(nowMs)
  next.setHours(24, 0, 0, 0)
  return next.getTime()
}

/**
 * `buildConversationIndex` for a screen that stays open. The index judges
 * Follow-ups, staleness and "this month" at a clock that moves only when that
 * can change the answer: when the soonest upcoming Follow-up turns missed, at
 * midnight, and on returning to the app. So a Follow-up leaves Upcoming for
 * Missed without waiting for a Visit to change, and nothing re-renders in
 * between.
 */
export default function useConversationIndex(
  conversations: Visit[],
  breakpoints: StalenessBreakpoints
) {
  const [now, setNow] = useState(() => Date.now())
  const index = buildConversationIndex(
    conversations,
    breakpoints,
    undefined,
    now
  )
  const wakeAt = Math.min(
    index.followUpsChangeAtMs ?? Infinity,
    nextMidnightMs(now)
  )

  useEffect(() => {
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, wakeAt - Date.now()) + SLACK_MS
    )
    const foreground = addForegroundListener(() => setNow(Date.now()))
    return () => {
      clearTimeout(timer)
      foreground.remove()
    }
  }, [now, wakeAt])

  return index
}
