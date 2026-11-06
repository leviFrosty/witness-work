import { useEffect, useState } from 'react'
import { loadAccountDevices } from '@/app/account/accountActivity'
import { deviceTitle } from '@/features/settings/components/account/activity/activityCopy'
import { isTooOldForKeyChange } from '@/lib/serverAccount/accountDevices'
import { logger } from '@/lib/logger'

/** A device too old for a key change: its session, and the name to show. */
export type TooOldDevice = { id: string; name: string }

/**
 * The account's other devices whose app can't sign back in after a key change
 * (ADR 0039 §10). Empty until the list is read; `unknown` when it can't be, so
 * the screen still warns.
 */
export default function useDevicesTooOldForKeyChange():
  | TooOldDevice[]
  | 'unknown' {
  const [devices, setDevices] = useState<TooOldDevice[] | 'unknown'>([])
  useEffect(() => {
    const controller = new AbortController()
    loadAccountDevices(controller.signal)
      .then(({ devices, context }) => {
        if (controller.signal.aborted) return
        // Two devices can share a name ("Browser on macOS"); the session tells
        // them apart.
        setDevices(
          devices.filter(isTooOldForKeyChange).map((device) => ({
            id: device.sessionId,
            name: deviceTitle(device, context),
          }))
        )
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        logger.warn('[keyChange] listing devices failed', error)
        setDevices('unknown')
      })
    return () => controller.abort()
  }, [])
  return devices
}
