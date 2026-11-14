import { useEffect, useState } from 'react'
import useIsSupporter from '@/hooks/useIsSupporter'
import { usePreferences } from '@/stores/preferences'
import { cloudSyncDefaultMayApply } from '@/app/sync/syncDefaults'
import { hasSyncTransport } from '@/lib/syncTransport'
import { cloudSyncOffered } from '@/lib/syncTransport/provider'

export default function useOnboardingCloudSyncAvailable(
  reached: boolean
): boolean {
  const { isSupporter } = useIsSupporter()
  const {
    iCloudSyncEnabled,
    syncProvider,
    cloudSyncConfig,
    cloudSyncEntitled,
    installedBeforeFreeSync,
  } = usePreferences()
  const live =
    hasSyncTransport() &&
    !iCloudSyncEnabled &&
    syncProvider !== 'platform' &&
    cloudSyncConfig?.enabled === true &&
    cloudSyncOffered() &&
    cloudSyncDefaultMayApply({
      installedBeforeFreeSync,
      isSupporter,
      entitlement: cloudSyncConfig.entitlement,
      cloudSyncEntitled,
    })
  const [held, setHeld] = useState<boolean | null>(null)

  useEffect(() => {
    if (reached && held === null) setHeld(live)
  }, [reached, held, live])

  return held ?? live
}
