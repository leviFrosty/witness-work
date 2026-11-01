import { useEffect } from 'react'
import type { ScribeUsageState } from '@/features/scribe/types'
import { toScribeUsage } from '@/features/scribe/lib/usageSnapshot'
import { refreshUsage } from '@/features/scribe/runtime/status'
import { useScribeUsageStore } from '@/features/scribe/stores/usage'
import { useUsageClock } from '@/features/scribe/hooks/useUsageClock'

const refresh = () => void refreshUsage({ force: true })

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
