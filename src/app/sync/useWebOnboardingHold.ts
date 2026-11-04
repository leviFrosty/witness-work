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

/**
 * How long the hold shows "Getting your account ready…" before it offers Retry.
 * The decision itself takes up to about 12 s; it goes on in the background.
 */
export const FIRST_SYNC_WAIT_MS = 20_000

export type OnboardingHold = 'none' | 'checking' | 'stalled'

/**
 * Whether onboarding waits (`webFirstSync`): only on the web, only before it
 * finished, and only until a complete Cloud Sync pull this launch, which also
 * covers a web-only account's empty listing. A browser that brings in a phone's
 * data finishes onboarding instead.
 */
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

/** `onboardingHold` for this device, with the wait that offers Retry. */
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
