import { Share } from 'react-native'
import links from '@/constants/links'
import i18n from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import { errorTracking } from '@/lib/errorTracking'

export type ShareAppSource = 'settings'

export const shareApp = async (source: ShareAppSource) => {
  analytics.capture('app_share_tapped', { source })
  try {
    const result = await Share.share({
      message: i18n.t('shareApp_message', {
        androidUrl: links.playStore,
        iosUrl: links.appStore,
      }),
    })
    analytics.capture('app_share_completed', {
      source,
      outcome: result.action === Share.dismissedAction ? 'dismissed' : 'shared',
    })
  } catch (error) {
    analytics.capture('app_share_failed', { source })
    errorTracking.captureException(error)
  }
}
