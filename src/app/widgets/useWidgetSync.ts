import { useEffect } from 'react'
import { useFeatureFlagValue } from '@/lib/featureFlags'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import {
  installWidgetSync,
  setWidgetBuddiesEnabled,
} from '@/app/widgets/widgetSync'

export function useWidgetSync(storageReady: boolean | undefined) {
  const buddiesFlag = useFeatureFlagValue('buddies')
  const buddiesEnabled = useBuddiesEnabled()

  useEffect(() => {
    if (!storageReady) return
    return installWidgetSync()
  }, [storageReady])

  useEffect(() => {
    if (!storageReady) return

    if (buddiesFlag === undefined && !buddiesEnabled) return
    setWidgetBuddiesEnabled(buddiesEnabled)
  }, [storageReady, buddiesFlag, buddiesEnabled])
}
