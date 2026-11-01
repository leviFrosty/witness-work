import { useEffect } from 'react'
import { BackHandler } from 'react-native'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import { useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { analytics } from '@/lib/analytics'
import { addForegroundListener } from '@/lib/appLifecycle'
import { addReconnectListener } from '@/lib/http/online'
import {
  APP_CONFIG_MIN_INTERVAL_MS,
  checkAppConfig,
  useUpdateRequired,
} from '@/lib/appUpdate'
import i18n from '@/lib/locales'
import { openStoreListing } from '@/lib/storeListing'
import { useAppLockSession, useAppLockSettings } from '@/stores/appLock'
import UpdateRequiredScreen from '@/app/update-required/UpdateRequiredScreen'

export default function UpdateRequiredGate() {
  const required = useUpdateRequired((s) => s.required)
  const appLockOn = useAppLockSettings((s) => s.enabled)
  const appLocked = useAppLockSession((s) => s.locked) && appLockOn
  useTakeoverHold('updateRequired', required !== null)

  useEffect(() => {
    void checkAppConfig()
    const subscription = addForegroundListener(() => void checkAppConfig(), {
      minIntervalMs: APP_CONFIG_MIN_INTERVAL_MS,
    })

    const reconnect = addReconnectListener(() => void checkAppConfig())
    return () => {
      subscription.remove()
      reconnect.remove()
    }
  }, [])

  useEffect(() => {
    if (required)
      analytics.capture('update_required_shown', {
        source: required.source,
        min_version: required.minVersion,
      })
  }, [required])

  if (!required || appLocked) return null

  const openStore = () => {
    analytics.capture('update_required_store_opened', {
      source: required.source,
    })
    void openStoreListing({ title: i18n.t('updateRequired_title') })
  }

  return (
    <FullWindowOverlay onClose={() => BackHandler.exitApp()}>
      <UpdateRequiredScreen required={required} onUpdate={openStore} />
    </FullWindowOverlay>
  )
}
