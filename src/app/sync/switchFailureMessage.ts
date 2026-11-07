import type { SwitchFailure, SyncOption } from '@/app/sync/syncOption'
import i18n from '@/lib/locales'
import { optionSyncKey } from '@/lib/syncCopy'

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
