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
import { openAppUpdate } from '@/lib/storeListing'
import { useAppLockSession, useAppLockSettings } from '@/stores/appLock'
import UpdateRequiredScreen from '@/app/update-required/UpdateRequiredScreen'

/**
 * Update Required (ADR 0027): blocks the app while this version is below the
 * minimum ww-api asks for, read at launch, on each return to the foreground and
 * when the connection comes back, or after ww-api refused a request with 426.
 * Above every sheet and screen, below App Lock: while App Lock covers the app,
 * this waits, so it can't land on top of the lock when the answer comes after
 * it (a launch, or a return to the foreground).
 */
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
    // A launch without a connection read nothing (Cloud Sync's switches too).
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
    void openAppUpdate({ title: i18n.t('updateRequired_title') })
  }

  return (
    <FullWindowOverlay
      // Android's back button leaves the app rather than the screen.
      onClose={() => BackHandler.exitApp()}
    >
      <UpdateRequiredScreen required={required} onUpdate={openStore} />
    </FullWindowOverlay>
  )
}
