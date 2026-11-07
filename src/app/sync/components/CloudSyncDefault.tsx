import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import useIsSupporter from '@/hooks/useIsSupporter'
import { usePreferences } from '@/stores/preferences'
import { iCloudSync } from '@/app/sync/iCloudSync'
import { prepareCloudSync } from '@/app/sync/cloudSync'
import { withSyncOptionLock } from '@/app/sync/syncOptionLock'
import { analytics } from '@/lib/analytics'
import { cloudSyncDefaultMayApply } from '@/app/sync/syncDefaults'
import {
  cloudSyncDefaultHeld,
  onCloudSyncDefaultReleased,
} from '@/app/sync/cloudSyncDefaultHold'
import {
  onFirstSyncRetry,
  releaseFirstSync,
  stallFirstSync,
  type FirstSyncStallReason,
} from '@/app/sync/webFirstSync'
import type { SyncPayload } from '@/app/sync/payload'
import { checkAppConfig } from '@/lib/appUpdate'
import { completeOnboardingFromRestore } from '@/features/settings/lib/completeOnboardingFromRestore'
import { cloudSyncOnly, hasSyncEngine } from '@/lib/syncTransport/platform'
import { onAccountChange } from '@/lib/serverAccount'
import {
  addActiveRemoteChangeListener,
  cloudSyncOffered,
} from '@/lib/syncTransport/provider'

export default function CloudSyncDefault() {
  const { isSupporter } = useIsSupporter()
  const {
    iCloudSyncEnabled,
    iCloudSyncSetByUser,
    syncProvider,
    cloudSyncConfig,
    cloudSyncEntitled,
    onboardingComplete,
    installedBeforeFreeSync,
  } = usePreferences()
  const offered =
    syncProvider !== 'platform' &&
    cloudSyncConfig?.enabled === true &&
    cloudSyncOffered()

  const mayBeEntitled =
    cloudSyncDefaultMayApply({
      installedBeforeFreeSync,
      isSupporter,
      entitlement: cloudSyncConfig?.entitlement,
      cloudSyncEntitled,
    }) ||
    (cloudSyncOnly() && cloudSyncEntitled !== false)

  const [retries, setRetries] = useState(0)

  useEffect(() => {
    if (!cloudSyncOnly()) return
    return onFirstSyncRetry(() => {
      void checkAppConfig({ force: true })

      if (usePreferences.getState().iCloudSyncEnabled)
        void iCloudSync.pullAndMerge('enabled').catch(() => stallFirstSync())
      else setRetries((n) => n + 1)
    })
  }, [])

  useEffect(() => {
    if (!hasSyncEngine()) return
    const web = cloudSyncOnly()

    if (!onboardingComplete && !web) return
    if (!offered) return
    if (!mayBeEntitled) {
      if (web) releaseFirstSync()
      return
    }
    if (iCloudSyncSetByUser || iCloudSyncEnabled) return

    let settled = false
    let running = false
    let again = false

    let generation = 0
    let retrySubs: Array<{ remove: () => void }> | null = null
    const settle = () => {
      settled = true
      retrySubs?.forEach((sub) => sub.remove())
      retrySubs = null
    }
    const retryLater = (reason?: FirstSyncStallReason) => {
      if (web) stallFirstSync(reason)
      if (retrySubs) return
      retrySubs = [
        addActiveRemoteChangeListener(() => void attempt()),
        AppState.addEventListener('change', (state) => {
          if (state === 'active') void attempt()
        }),
      ]
    }
    const report = (outcome: string) =>
      analytics.capture('cloud_sync_default_outcome', { outcome })
    const attempt = async () => {
      if (settled) return
      if (running) {
        again = true
        return
      }
      running = true
      try {
        await withSyncOptionLock(decide)
      } catch {
        report('failed')
        settle()
        if (web) stallFirstSync()
      } finally {
        running = false
        if (again) {
          again = false
          void attempt()
        }
      }
    }

    const decide = async () => {
      if (settled || cloudSyncDefaultHeld()) return
      const started = generation
      const live = usePreferences.getState()
      if (live.iCloudSyncEnabled || live.iCloudSyncSetByUser) {
        settle()
        return
      }
      const prepared = await prepareCloudSync()
      if (settled || cloudSyncDefaultHeld() || started !== generation) return
      if (prepared.outcome !== 'ready') {
        report(prepared.outcome)

        if (
          prepared.outcome === 'no_session' ||
          (prepared.outcome === 'not_entitled' && isSupporter)
        )
          retryLater()
        else {
          settle()

          if (web && prepared.outcome === 'disabled') stallFirstSync('paused')
          else if (web) releaseFirstSync()
        }
        return
      }
      const tokenBefore = usePreferences.getState().cloudSyncAccountToken
      const decision = await iCloudSync.resolveInitialEnable()
      if (settled || cloudSyncDefaultHeld() || started !== generation) return

      if (
        decision.outcome === 'unavailable' &&
        usePreferences.getState().cloudSyncAccountToken !== tokenBefore
      ) {
        again = true
        return
      }
      report(decision.outcome)
      switch (decision.outcome) {
        case 'seed':
          settle()
          usePreferences.setState({ syncProvider: 'cloud' })
          await iCloudSync.applySeedEnable('supporter_default')
          if (web) await readAccount()
          return
        case 'pull':
          settle()
          usePreferences.setState({ syncProvider: 'cloud' })
          iCloudSync.applyPullEnable(decision.remote, 'supporter_default')
          if (web) {
            finishOnboarding()
            await readAccount()
          }
          return
        case 'incomplete': {
          const unreadable =
            decision.reason === 'newer-version' ||
            decision.reason === 'invalid-file'

          if (web && unreadable && decision.remote) {
            await mergeKeepingAccountSettings(decision.remote)
            return
          }
          retryLater(unreadable ? 'unreadable' : undefined)
          return
        }
        case 'conflict':
          if (web) {
            await mergeKeepingAccountSettings(decision.remote)
            return
          }
          usePreferences.getState().set({
            syncProvider: 'cloud',
            iCloudSyncNeedsResolution: true,
          })
          settle()
          return
        case 'unavailable':
          retryLater()
          return
      }
    }

    const mergeKeepingAccountSettings = async (remote: SyncPayload) => {
      settle()
      usePreferences.setState({ syncProvider: 'cloud' })
      try {
        await iCloudSync.applyMergeEnable(remote, 'supporter_default', {
          keepRemoteSettings: true,
        })
      } catch {
        report('merge_incomplete')
      }
      finishOnboarding()
    }

    const readAccount = () => iCloudSync.pullAndMerge('enabled')

    const finishOnboarding = () => {
      if (!usePreferences.getState().onboardingComplete)
        completeOnboardingFromRestore('cloud_sync')
    }
    void attempt()

    const accountSub = onAccountChange((change) => {
      if (change !== 'key_changed') return
      generation += 1
      settled = false
      void attempt()
    })

    const releaseSub = onCloudSyncDefaultReleased(() => {
      generation += 1
      settled = false
      void attempt()
    })

    return () => {
      accountSub()
      releaseSub()
      settle()
    }
  }, [
    onboardingComplete,
    offered,
    mayBeEntitled,
    isSupporter,
    iCloudSyncSetByUser,
    iCloudSyncEnabled,
    retries,
  ])

  return null
}
