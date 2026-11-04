import { useEffect } from 'react'
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
import { hasSyncTransport } from '@/lib/syncTransport'
import { onAccountChange } from '@/lib/serverAccount'
import {
  addActiveRemoteChangeListener,
  cloudSyncOffered,
} from '@/lib/syncTransport/provider'

/**
 * Cloud Sync is the default (ADR 0030 §3, ADR 0040 §2). A device that never
 * chose a sync option gets it once the server's switch is on and the device is
 * entitled: every new install, and on an install from before sync was free only
 * a Supporter, as it was then (`cloudSyncDefaultMayApply`). It opens the
 * account's session (creating the account key when there's none), then decides
 * like the iCloud auto-enable: seed an empty account, pull everything into a
 * device without records, or leave sync off and ask in Settings when both have
 * records. A device already on iCloud or Drive, or one whose User turned sync
 * off, is left alone. Waits for onboarding to finish. When the account key is
 * replaced (a recovery key, a QR code; ADR 0030 §7) it decides again on the new
 * account at once, whatever it had settled on or was still reading. It decides
 * nothing while the key is being replaced (`holdCloudSyncDefault`): leaving the
 * old account turns sync off, and a decision then would read that account.
 */
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
  const mayBeEntitled = cloudSyncDefaultMayApply({
    installedBeforeFreeSync,
    isSupporter,
    entitlement: cloudSyncConfig?.entitlement,
    cloudSyncEntitled,
  })

  useEffect(() => {
    if (!hasSyncTransport()) return
    // Not during onboarding: a new phone that signs in with a QR code or a
    // recovery key there gets its account key that way, and iCloud Keychain
    // or Block Store may still be bringing one. Creating a key first would
    // start an account of its own.
    if (!onboardingComplete) return
    if (!offered || !mayBeEntitled) return
    if (iCloudSyncSetByUser || iCloudSyncEnabled) return

    // Only a retryable outcome decides again; the rest are final here, until
    // what this effect reads changes.
    let settled = false
    let running = false
    let again = false
    // Counts account key changes and replaces; a decision that started before
    // one read the previous account, so it doesn't apply.
    let generation = 0
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
        await withSyncOptionLock(decide)
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
    // Under the lock, so a switch (the account's Cloud Sync request, Settings)
    // never runs beside it; one that ran first may have chosen already.
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
        // Offline, or attesting failed for now: try again on return. So
        // does a Supporter the server can't confirm yet (RevenueCat down,
        // or the purchase not linked to the account yet).
        if (
          prepared.outcome === 'no_session' ||
          (prepared.outcome === 'not_entitled' && isSupporter)
        )
          retryLater()
        else settle()
        return
      }
      const tokenBefore = usePreferences.getState().cloudSyncAccountToken
      const decision = await iCloudSync.resolveInitialEnable()
      if (settled || cloudSyncDefaultHeld() || started !== generation) return
      // The identity check found this device on another server account than
      // the one it last synced with, turned sync off and recorded the new one
      // (a recovery key or QR code just replaced the key). Nothing is wrong
      // now: decide on the new account, not at the next foreground.
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
    }
    void attempt()

    // The new account has its own records and entitlement, and the first
    // decision on it may have found this device's identity check turning sync
    // off, which only a foreground retried.
    const accountSub = onAccountChange((change) => {
      if (change !== 'key_changed') return
      generation += 1
      settled = false
      void attempt()
    })

    // The key replace is over: decide on the account the device is on now.
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
  ])

  return null
}
