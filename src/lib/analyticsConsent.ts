import { analytics } from '@/lib/analytics'
import {
  analyticsEventsAllowed,
  setAnalyticsEventsAllowed,
} from '@/lib/analyticsPolicy'
import { usePreferences } from '@/stores/preferences'
import { isStorageLocked } from '@/stores/mmkv'

function publish(): void {
  const wasAllowed = analyticsEventsAllowed()

  setAnalyticsEventsAllowed(
    !isStorageLocked() &&
      usePreferences.persist.hasHydrated() &&
      usePreferences.getState().analyticsEnabled
  )

  if (wasAllowed && !analyticsEventsAllowed()) analytics.reset()
}

publish()
usePreferences.persist.onFinishHydration(publish)
usePreferences.subscribe(publish)
