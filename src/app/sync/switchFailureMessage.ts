import type { SwitchFailure, SyncOption } from '@/app/sync/syncOption'
import i18n from '@/lib/locales'
import { optionSyncKey } from '@/lib/syncCopy'

/**
 * What to tell the User when a switch to `to` or Cloud Sync's turn-on can't
 * happen. Worded for `to`: the device is back on the option it left.
 */
export const switchFailureMessage = (reason: SwitchFailure, to: SyncOption) => {
  const option = to === 'cloud' ? 'cloud' : 'platform'
  switch (reason) {
    case 'not_entitled':
      return i18n.t('cloudSyncNotEntitled')
    case 'disabled':
      return i18n.t('cloudSyncDisabled')
    case 'no_session':
      return i18n.t('cloudSyncNoSession')
    case 'offline':
      return i18n.t('iCloudSyncNowOffline_description')
    case 'incomplete':
      return i18n.t(optionSyncKey('iCloudRemoteNotReady_description', option))
    case 'unavailable':
      return i18n.t(optionSyncKey('iCloudUnavailable_description', option))
    case 'account_changed':
      return i18n.t('syncOption_accountChanged')
  }
}
