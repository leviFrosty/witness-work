import { useEffect, useState } from 'react'
import { hasSyncTransport } from '@/lib/syncTransport/platform'
import { usePreferences } from '@/stores/preferences'
import {
  iCloudPullWaitRemainingMs,
  subscribeICloudPullWait,
} from '@/lib/iCloudPullWait'

/**
 * False while a launch-time decision should still wait for iCloud: sync is on
 * for this device and, since the app came to the foreground, no complete pull
 * has finished and `ICLOUD_PULL_WAIT_MS` hasn't passed — iCloud on iOS, Google
 * Drive on Android. Always true with sync off. See `lib/iCloudPullWait`.
 */
export default function useICloudPullSettled(): boolean {
  const iCloudSyncEnabled = usePreferences((s) => s.iCloudSyncEnabled)
  const iCloudSyncOn = hasSyncTransport() && iCloudSyncEnabled === true
  const [, rerender] = useState(0)
  const remainingMs = iCloudPullWaitRemainingMs({ iCloudSyncOn })

  useEffect(() => subscribeICloudPullWait(() => rerender((n) => n + 1)), [])
  useEffect(() => {
    if (remainingMs === 0 || remainingMs === Infinity) return
    const timer = setTimeout(() => rerender((n) => n + 1), remainingMs)
    return () => clearTimeout(timer)
  }, [remainingMs])

  return remainingMs === 0
}
