import { useEffect, useState } from 'react'
import { loadAccountDevices } from '@/app/account/accountActivity'
import { deviceTitle } from '@/features/settings/components/account/activity/activityCopy'
import { isTooOldForKeyChange } from '@/lib/serverAccount/accountDevices'
import { logger } from '@/lib/logger'

export type TooOldDevice = { id: string; name: string }

export default function useDevicesTooOldForKeyChange():
  | TooOldDevice[]
  | 'unknown' {
  const [devices, setDevices] = useState<TooOldDevice[] | 'unknown'>([])
  useEffect(() => {
    const controller = new AbortController()
    loadAccountDevices(controller.signal)
      .then(({ devices, context }) => {
        if (controller.signal.aborted) return

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
