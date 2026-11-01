import { useEffect, useState } from 'react'
import { addForegroundListener } from '@/lib/appLifecycle'
import { buildConversationIndex } from '@/lib/conversationIndex'
import { StalenessBreakpoints } from '@/types/staleness'
import { Visit } from '@/types/visit'

const SLACK_MS = 1000

const nextMidnightMs = (nowMs: number) => {
  const next = new Date(nowMs)
  next.setHours(24, 0, 0, 0)
  return next.getTime()
}

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
