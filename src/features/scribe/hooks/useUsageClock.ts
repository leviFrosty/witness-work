import { useEffect, useState } from 'react'
import type { UsageSnapshotWire } from '@/features/scribe/lib/wire'
import { nextUsageChange } from '@/features/scribe/lib/usageSnapshot'
import { refreshUsage } from '@/features/scribe/runtime/status'

const MAX_WAIT_MS = 60 * 60_000

export function useUsageClock(snapshot: UsageSnapshotWire | null): number {
  const [now, setNow] = useState(() => Date.now())
  const next = nextUsageChange(snapshot, now)

  useEffect(() => {
    if (next === null) return
    const wait = Math.min(Math.max(next - Date.now(), 0), MAX_WAIT_MS)
    const timer = setTimeout(() => {
      const at = Date.now()
      setNow(at)
      if (at >= next) void refreshUsage({ force: true, open: false })
    }, wait)
    return () => clearTimeout(timer)
  }, [next, now])

  return now
}
