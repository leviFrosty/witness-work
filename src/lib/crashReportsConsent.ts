import { setCrashReportsAllowed } from '@/lib/errorTrackingPolicy'
import { usePreferences } from '@/stores/preferences'
import { isStorageLocked } from '@/stores/mmkv'

function publish(): void {
  if (isStorageLocked()) setCrashReportsAllowed(false)
  else if (usePreferences.persist.hasHydrated())
    setCrashReportsAllowed(usePreferences.getState().crashReportsEnabled)
}

publish()
usePreferences.persist.onFinishHydration(publish)
usePreferences.subscribe(publish)
