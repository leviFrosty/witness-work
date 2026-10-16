import { useEffect } from 'react'
import { BackHandler, Platform } from 'react-native'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import links from '@/constants/links'
import { useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { analytics } from '@/lib/analytics'
import { addForegroundListener } from '@/lib/appLifecycle'
import {
  APP_CONFIG_MIN_INTERVAL_MS,
  checkAppConfig,
  useUpdateRequired,
} from '@/lib/appUpdate'
import { openURL } from '@/lib/links'
import i18n from '@/lib/locales'
import UpdateRequiredScreen from '@/app/update-required/UpdateRequiredScreen'

/**
 * Update Required (ADR 0027): blocks the app while this version is below the
 * minimum ww-api asks for, read at launch and on each return to the foreground,
 * or after ww-api refused a request with 426. Above every sheet and screen,
 * below App Lock.
 */
export default function UpdateRequiredGate() {
  const required = useUpdateRequired((s) => s.required)
  useTakeoverHold('updateRequired', required !== null)

  useEffect(() => {
    void checkAppConfig()
    const subscription = addForegroundListener(() => void checkAppConfig(), {
      minIntervalMs: APP_CONFIG_MIN_INTERVAL_MS,
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (required)
      analytics.capture('update_required_shown', {
        source: required.source,
        min_version: required.minVersion,
      })
  }, [required])

  if (!required) return null

  const openStore = () => {
    analytics.capture('update_required_store_opened', {
      source: required.source,
    })
    const android = Platform.OS === 'android'
    void openURL(android ? links.playStore : links.appStore, {
      alert: {
        title: i18n.t('updateRequired_title'),
        description: i18n.t(
          android
            ? 'updateRequired_storeFailedAndroid'
            : 'updateRequired_storeFailed'
        ),
      },
    })
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
