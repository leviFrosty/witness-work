import { useEffect, useState } from 'react'
import { usePreferences } from '@/stores/preferences'
import { toast } from '@/stores/toasts'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import {
  claimAutoRestore,
  cloudSyncRestoreOffered,
  findCloudSyncRestore,
  freshInstall,
  restoreFromCloudSync,
} from '@/app/sync/cloudSyncRestore'
import { iCloudSync } from '@/app/sync/iCloudSync'
import type { SyncPayload } from '@/app/sync/payload'
import { payloadReferencesPhotos } from '@/app/sync/photoReferences'
import { completeOnboardingFromRestore } from '@/features/settings/lib/completeOnboardingFromRestore'

export type CloudSyncRestoreState =
  | { status: 'off' }
  | { status: 'checking' }
  | { status: 'no_account' }
  | { status: 'found'; remote: SyncPayload }
  | { status: 'restoring' }
  | { status: 'none' | 'incomplete' | 'offline' | 'unavailable' }

type RestoreMode = 'auto' | 'manual'

const finishRestore = (remote: SyncPayload, mode: RestoreMode) => {
  analytics.capture('import_completed', {
    import_type: 'cloud_sync',
    source: 'onboarding',
    mode,
  })
  completeOnboardingFromRestore('cloud_sync')
  if (payloadReferencesPhotos(remote)) void iCloudSync.pullImagesIfEnabled()
  toast.success(i18n.t('onboardingCloudSyncReady_title'), {
    message: i18n.t('onboardingCloudSyncReady_message'),
    durationMs: 6000,
  })
}

export default function useCloudSyncRestore(active: boolean) {
  const configEnabled = usePreferences(
    (s) => s.cloudSyncConfig?.enabled === true
  )
  const offered = configEnabled && cloudSyncRestoreOffered()
  const [state, setState] = useState<CloudSyncRestoreState>({
    status: 'checking',
  })
  const [search, setSearch] = useState(0)

  useEffect(() => {
    if (!active) return
    if (!offered) {
      setState({ status: 'off' })
      return
    }
    let cancelled = false
    setState({ status: 'checking' })
    void findCloudSyncRestore({ fresh: search > 0 })
      .then((result) => {
        if (cancelled) return
        analytics.capture('icloud_restore_probe_result', {
          source: 'welcome_back',
          import_type: 'cloud_sync',
          status: result.status,
        })
        if (result.status !== 'found') {
          setState({ status: result.status })
          return
        }
        if (!freshInstall() || !claimAutoRestore()) {
          setState({ status: 'found', remote: result.remote })
          return
        }
        setState({ status: 'restoring' })
        requestAnimationFrame(() => {
          if (cancelled || !restoreFromCloudSync(result.remote)) {
            if (!cancelled) setState({ status: 'found', remote: result.remote })
            return
          }
          finishRestore(result.remote, 'auto')
        })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'unavailable' })
      })
    return () => {
      cancelled = true
    }
  }, [active, offered, search])

  const restore = (remote: SyncPayload): boolean => {
    if (!freshInstall()) return false
    setState({ status: 'restoring' })
    requestAnimationFrame(() => {
      if (!restoreFromCloudSync(remote)) {
        setState({ status: 'found', remote })
        return
      }
      finishRestore(remote, 'manual')
    })
    return true
  }

  return {
    state,
    retry: () => setSearch((n) => n + 1),
    restore,
  }
}
