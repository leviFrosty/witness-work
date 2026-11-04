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
 *
 * The web (ADR 0037 §2, ADR 0040 §2) has only Cloud Sync and gets its account
 * key by signing in, before onboarding, so it decides at once: it brings in the
 * account's data and skips onboarding, as a phone that restored from its other
 * phone does, or seeds a web-only account and lets onboarding run. With records
 * on both sides it merges records, keeping both (it has nowhere else to keep
 * its own), and keeps the account's preferences and profile; so it does when
 * another device's slot can't be read here, leaving that slot alone. Onboarding
 * waits for it (`webFirstSync`): an outcome that tries again later stalls the
 * wait, whose Retry decides again, and only the server saying the account isn't
 * entitled releases it.
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
  // The web asks the server until it has answered: onboarding waits on it, and
  // may run only once the account is known not to be entitled.
  const mayBeEntitled =
    cloudSyncDefaultMayApply({
      installedBeforeFreeSync,
      isSupporter,
      entitlement: cloudSyncConfig?.entitlement,
      cloudSyncEntitled,
    }) ||
    (cloudSyncOnly() && cloudSyncEntitled !== false)
  // Each Retry from the web's onboarding hold decides again.
  const [retries, setRetries] = useState(0)

  useEffect(() => {
    if (!cloudSyncOnly()) return
    return onFirstSyncRetry(() => {
      // The server's switch may have been what was missing.
      void checkAppConfig({ force: true })
      // Already on (seeded): the account just needs reading in full.
      if (usePreferences.getState().iCloudSyncEnabled)
        void iCloudSync.pullAndMerge('enabled').catch(() => stallFirstSync())
      else setRetries((n) => n + 1)
    })
  }, [])

  useEffect(() => {
    if (!hasSyncEngine()) return
    const web = cloudSyncOnly()
    // Not during onboarding: a new phone that signs in with a QR code or a
    // recovery key there gets its account key that way, and iCloud Keychain
    // or Block Store may still be bringing one. Creating a key first would
    // start an account of its own. A browser is signed in already.
    if (!onboardingComplete && !web) return
    if (!offered) return
    if (!mayBeEntitled) {
      // The server said sync isn't for this account, so there's nothing to
      // overwrite.
      if (web) releaseFirstSync()
      return
    }
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
    const retryLater = (reason?: FirstSyncStallReason) => {
      // The web's onboarding hold offers Retry meanwhile.
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
        else {
          settle()
          // Off on the server for now: Retry asks again. Not entitled:
          // sync won't run, so nothing can be overwritten.
          if (web && prepared.outcome === 'disabled') stallFirstSync('paused')
          else if (web) releaseFirstSync()
        }
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
          // Another device's slot that this browser can't read (damaged, or
          // from a newer version) would hold it every time. The rest of the
          // account is read in full, so merge that as for a conflict; the
          // slot stays as it is.
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
    // The web, with records on both sides or a slot it can't read: only
    // records merge, since this browser's preferences and profile may be
    // newer only because it was just set up. Onboarding is done.
    const mergeKeepingAccountSettings = async (remote: SyncPayload) => {
      settle()
      usePreferences.setState({ syncProvider: 'cloud' })
      try {
        await iCloudSync.applyMergeEnable(remote, 'supporter_default', {
          keepRemoteSettings: true,
        })
      } catch {
        // Sync stays on and finishes it like any other pull.
        report('merge_incomplete')
      }
      finishOnboarding()
    }
    // The browser's first pull: it brings the peers' RevenueCat claims, and
    // says the account was read in full (`cloudSyncPullSettled`), which the
    // decision's own read doesn't.
    const readAccount = () => iCloudSync.pullAndMerge('enabled')
    // The account's profile and preferences replace what onboarding asks.
    const finishOnboarding = () => {
      if (!usePreferences.getState().onboardingComplete)
        completeOnboardingFromRestore('cloud_sync')
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
    retries,
  ])

  return null
}
