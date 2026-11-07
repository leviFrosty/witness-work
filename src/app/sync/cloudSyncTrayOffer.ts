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

export type CloudSyncTrayOfferVariant = 'free' | 'thanks'

export type CloudSyncTrayOfferInput = {
  hasSyncTransport: boolean

  cloudSyncOffered: boolean
  entitlement: SyncEntitlement | undefined
  installedBeforeFreeSync: boolean
  onboardingComplete: boolean
  cloudSyncTrayOffer: CloudSyncTrayOfferState
  option: SyncOption
  isSupporter: boolean
}

export function cloudSyncTrayOfferVariant(
  input: CloudSyncTrayOfferInput
): CloudSyncTrayOfferVariant | null {
  if (!input.hasSyncTransport || !input.cloudSyncOffered) return null

  if (!input.installedBeforeFreeSync || !input.onboardingComplete) return null
  if (input.cloudSyncTrayOffer === 'answered' || input.option === 'cloud')
    return null
  if (input.isSupporter) return 'thanks'
  return input.entitlement === 'everyone' ? 'free' : null
}

export function retireCloudSyncTrayOffer(): void {
  if (usePreferences.getState().cloudSyncTrayOffer === 'answered') return
  usePreferences.setState({ cloudSyncTrayOffer: 'answered' })
}

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
