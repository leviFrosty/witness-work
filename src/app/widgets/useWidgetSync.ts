import { useEffect } from 'react'
import { installWidgetSync } from '@/app/widgets/widgetSync'

export function useWidgetSync(storageReady: boolean | undefined) {
  useEffect(() => {
    if (!storageReady) return
    return installWidgetSync()
  }, [storageReady])
}
