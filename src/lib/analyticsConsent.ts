import { analytics } from '@/lib/analytics'
import {
  analyticsEventsAllowed,
  setAnalyticsEventsAllowed,
} from '@/lib/analyticsPolicy'
import { usePreferences } from '@/stores/preferences'
import { isStorageLocked } from '@/stores/mmkv'

function publish(): void {
  const wasAllowed = analyticsEventsAllowed()
  // A launch before the device's first unlock can't read the User's choice;
  // its default would turn analytics on for someone who turned them off.
  setAnalyticsEventsAllowed(
    !isStorageLocked() &&
      usePreferences.persist.hasHydrated() &&
      usePreferences.getState().analyticsEnabled
  )
  // Revoke and prune synchronously with the preference change; waiting for a
  // React effect leaves a window for a queued flush (or a rapid re-opt-in).
  if (wasAllowed && !analyticsEventsAllowed()) analytics.reset()
}

// Keep the provider's gate in step with the persisted choice from module load,
// before any React effect runs: hydration may already be complete (MMKV) or
// finish later (legacy AsyncStorage), and the user may change it at any time.
publish()
usePreferences.persist.onFinishHydration(publish)
usePreferences.subscribe(publish)
