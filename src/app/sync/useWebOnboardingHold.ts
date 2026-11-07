import { useEffect, useSyncExternalStore } from 'react'
import { usePreferences } from '@/stores/preferences'
import { cloudSyncOnly } from '@/lib/syncTransport/platform'
import {
  completedPullThisLaunch,
  onCompletedPull,
} from '@/lib/cloudSyncPullSettled'
import {
  firstSyncState,
  onFirstSyncChange,
  stallFirstSync,
  type FirstSyncState,
} from '@/app/sync/webFirstSync'

export const FIRST_SYNC_WAIT_MS = 20_000

export type OnboardingHold = 'none' | 'checking' | 'stalled'

export function onboardingHold({
  web,
  onboardingComplete,
  completedPull,
  firstSync,
}: {
  web: boolean
  onboardingComplete: boolean
  completedPull: boolean
  firstSync: FirstSyncState
}): OnboardingHold {
  if (!web || onboardingComplete || completedPull) return 'none'
  if (firstSync === 'released') return 'none'
  return firstSync
}

export function useWebOnboardingHold(): OnboardingHold {
  const onboardingComplete = usePreferences((s) => s.onboardingComplete)
  const completedPull = useSyncExternalStore(
    onCompletedPull,
    completedPullThisLaunch
  )
  const firstSync = useSyncExternalStore(onFirstSyncChange, firstSyncState)
  const hold = onboardingHold({
    web: cloudSyncOnly(),
    onboardingComplete,
    completedPull,
    firstSync,
  })

  useEffect(() => {
    if (hold !== 'checking') return
    const timer = setTimeout(() => stallFirstSync(), FIRST_SYNC_WAIT_MS)
    return () => clearTimeout(timer)
  }, [hold])

  return hold
}
