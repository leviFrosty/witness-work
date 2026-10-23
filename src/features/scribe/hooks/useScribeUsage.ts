import { useEffect } from 'react'
import type { ScribeUsageState } from '@/features/scribe/types'
import { toScribeUsage } from '@/features/scribe/lib/usageSnapshot'
import { refreshUsage } from '@/features/scribe/runtime/status'
import { useScribeUsageStore } from '@/features/scribe/stores/usage'
import { useUsageClock } from '@/features/scribe/hooks/useUsageClock'

const refresh = () => void refreshUsage({ force: true })

/**
 * The account's usage windows. Reads `GET /usage` on mount (at most every 30
 * s); every step and page read updates it too, and a window that resets while
 * it's shown reads as reset. `open: false` reads only with an existing session,
 * for screens that show usage in passing.
 */
export function useScribeUsage({ open = true } = {}): ScribeUsageState {
  const snapshot = useScribeUsageStore((state) => state.snapshot)
  const loading = useScribeUsageStore((state) => state.loading)
  const failed = useScribeUsageStore((state) => state.failed)
  const now = useUsageClock(snapshot)

  useEffect(() => {
    void refreshUsage({ open })
  }, [open])

  return {
    usage: snapshot ? toScribeUsage(snapshot, now) : null,
    loading,
    failed,
    refresh,
  }
}
