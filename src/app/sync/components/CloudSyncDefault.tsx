import { useEffect } from 'react'
import { AppState } from 'react-native'
import useIsSupporter from '@/hooks/useIsSupporter'
import { usePreferences } from '@/stores/preferences'
import { iCloudSync } from '@/app/sync/iCloudSync'
import { prepareCloudSync } from '@/app/sync/cloudSync'
import { analytics } from '@/lib/analytics'
import { hasSyncTransport } from '@/lib/syncTransport'
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
  } = usePreferences()
  const offered =
    syncProvider !== 'platform' &&
    cloudSyncConfig?.enabled === true &&
    cloudSyncOffered()
  const mayBeEntitled =
    cloudSyncConfig?.entitlement === 'everyone' ||
    isSupporter ||
    cloudSyncEntitled === true

  useEffect(() => {
    if (!hasSyncTransport()) return

    if (!onboardingComplete) return
    if (!offered || !mayBeEntitled) return
    if (iCloudSyncSetByUser || iCloudSyncEnabled) return

    let settled = false
    let running = false
    let again = false
    let retrySubs: Array<{ remove: () => void }> | null = null
    const settle = () => {
      settled = true
      retrySubs?.forEach((sub) => sub.remove())
      retrySubs = null
    }
    const retryLater = () => {
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
        const prepared = await prepareCloudSync()
        if (settled) return
        if (prepared.outcome !== 'ready') {
          report(prepared.outcome)

          if (
            prepared.outcome === 'no_session' ||
            (prepared.outcome === 'not_entitled' && isSupporter)
          )
            retryLater()
          else settle()
          return
        }
        const decision = await iCloudSync.resolveInitialEnable()
        if (settled) return
        report(decision.outcome)
        switch (decision.outcome) {
          case 'seed':
            settle()
            usePreferences.setState({ syncProvider: 'cloud' })
            await iCloudSync.applySeedEnable('supporter_default')
            return
          case 'pull':
            settle()
            usePreferences.setState({ syncProvider: 'cloud' })
            iCloudSync.applyPullEnable(decision.remote, 'supporter_default')
            return
          case 'incomplete':
            retryLater()
            return
          case 'conflict':
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
      } catch {
        report('failed')
        settle()
      } finally {
        running = false
        if (again) {
          again = false
          void attempt()
        }
      }
    }
    void attempt()

    return settle
  }, [
    onboardingComplete,
    offered,
    mayBeEntitled,
    isSupporter,
    iCloudSyncSetByUser,
    iCloudSyncEnabled,
  ])

  return null
}
