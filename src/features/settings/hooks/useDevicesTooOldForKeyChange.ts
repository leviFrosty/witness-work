import { useEffect, useState } from 'react'
import { loadAccountDevices } from '@/app/account/accountActivity'
import { deviceTitle } from '@/features/settings/components/account/activity/activityCopy'
import { isTooOldForKeyChange } from '@/lib/serverAccount/accountDevices'
import { logger } from '@/lib/logger'

/**
 * The names of the account's other devices whose app can't sign back in after a
 * key change (ADR 0039 §10). Empty until the list is read; `unknown` when it
 * can't be, so the screen still warns.
 */
export default function useDevicesTooOldForKeyChange(): string[] | 'unknown' {
  const [names, setNames] = useState<string[] | 'unknown'>([])
  useEffect(() => {
    const controller = new AbortController()
    loadAccountDevices(controller.signal)
      .then(({ devices, context }) => {
        if (controller.signal.aborted) return
        setNames(
          devices
            .filter(isTooOldForKeyChange)
            .map((device) => deviceTitle(device, context))
        )
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        logger.warn('[keyChange] listing devices failed', error)
        setNames('unknown')
      })
    return () => controller.abort()
  }, [])
  return names
}
