import {
  switchSyncOption,
  type SwitchOutcome,
  type SyncOption,
} from '@/app/sync/syncOption'
import { switchFailureMessage } from '@/app/sync/switchFailureMessage'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { toast } from '@/stores/toasts'
import type { SyncEntitlement } from '@/lib/syncTransport/server/syncClient'
import type { CloudSyncTrayOfferState } from '@/stores/preferences'

/**
 * The notifications tray's one-time offer of Cloud Sync to an install from
 * before sync was free (ADR 0040 §2, §4). A Supporter gets a thank-you; anyone
 * else hears it's free, and only once it is (`sync:entitlement everyone`).
 */
export type CloudSyncTrayOfferVariant = 'free' | 'thanks'

export type CloudSyncTrayOfferInput = {
  /** This device has a sync transport (iCloud or Google Drive). */
  hasSyncTransport: boolean
  /** Cloud Sync is offered: registered, and the server's switch is on. */
  cloudSyncOffered: boolean
  entitlement: SyncEntitlement | undefined
  installedBeforeFreeSync: boolean
  onboardingComplete: boolean
  cloudSyncTrayOffer: CloudSyncTrayOfferState
  option: SyncOption
  isSupporter: boolean
}

/** Which offer the tray lists now, if any. */
export function cloudSyncTrayOfferVariant(
  input: CloudSyncTrayOfferInput
): CloudSyncTrayOfferVariant | null {
  if (!input.hasSyncTransport || !input.cloudSyncOffered) return null
  // A new install got Cloud Sync as its default; the offer is for the others.
  if (!input.installedBeforeFreeSync || !input.onboardingComplete) return null
  if (input.cloudSyncTrayOffer === 'answered' || input.option === 'cloud')
    return null
  if (input.isSupporter) return 'thanks'
  return input.entitlement === 'everyone' ? 'free' : null
}

/**
 * The offer is answered for good: the User turned Cloud Sync on or dismissed
 * it, or the device moved to Cloud Sync another way. It never comes back on
 * this device, even after it leaves Cloud Sync.
 */
export function retireCloudSyncTrayOffer(): void {
  if (usePreferences.getState().cloudSyncTrayOffer === 'answered') return
  usePreferences.setState({ cloudSyncTrayOffer: 'answered' })
}

/** The first time the tray shows the offer on this device. */
export function recordCloudSyncTrayOfferShown(supporter: boolean): void {
  if (usePreferences.getState().cloudSyncTrayOffer !== null) return
  usePreferences.setState({ cloudSyncTrayOffer: 'shown' })
  analytics.capture('cloud_sync_tray_offer_shown', { supporter })
}

export function dismissCloudSyncTrayOffer(supporter: boolean): void {
  if (usePreferences.getState().cloudSyncTrayOffer === 'answered') return
  retireCloudSyncTrayOffer()
  analytics.capture('cloud_sync_tray_offer_answered', {
    choice: 'dismiss',
    supporter,
  })
}

/**
 * One tap from the tray: switches to Cloud Sync, merging this device's data
 * into the account's (ADR 0030 §4). A success retires the offer; a failure says
 * what to do, and the offer stays.
 */
export async function turnOnCloudSyncFromTray(
  supporter: boolean
): Promise<SwitchOutcome> {
  analytics.capture('cloud_sync_tray_offer_answered', {
    choice: 'turn_on',
    supporter,
  })
  const outcome = await switchSyncOption('cloud', 'tray')
  if (outcome.outcome === 'switched') {
    retireCloudSyncTrayOffer()
    toast.success(i18n.t('syncOption_switchedCloud'))
  } else {
    toast.error(i18n.t('cloudSyncTrayOffer_failed'), {
      message: switchFailureMessage(outcome.reason, 'cloud'),
    })
  }
  return outcome
}
