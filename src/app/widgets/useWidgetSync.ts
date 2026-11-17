import { useEffect } from 'react'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import {
  installWidgetSync,
  setWidgetBuddiesEnabled,
} from '@/app/widgets/widgetSync'

export function useWidgetSync(storageReady: boolean | undefined) {
  const buddiesEnabled = useBuddiesEnabled()

  useEffect(() => {
    if (!storageReady) return
    return installWidgetSync()
  }, [storageReady])

  useEffect(() => {
    if (!storageReady) return

    setWidgetBuddiesEnabled(buddiesEnabled)
  }, [storageReady, buddiesEnabled])
}
