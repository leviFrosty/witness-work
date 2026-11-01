import { useEffect, useState } from 'react'
import { hasSyncTransport } from '@/lib/syncTransport/platform'
import { usePreferences } from '@/stores/preferences'
import {
  iCloudPullCanCome,
  iCloudPullWaitRemainingMs,
  subscribeICloudPullWait,
} from '@/lib/iCloudPullWait'

export default function useICloudPullSettled(): boolean {
  const iCloudSyncEnabled = usePreferences((s) => s.iCloudSyncEnabled)

  const iCloudSyncOn =
    hasSyncTransport() && iCloudSyncEnabled === true && iCloudPullCanCome()
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
