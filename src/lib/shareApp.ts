import { Share } from 'react-native'
import links from '@/constants/links'
import i18n from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import { errorTracking } from '@/lib/errorTracking'

/** Where a share of the app started. Bounded, safe as an analytics value. */
export type ShareAppSource = 'update_reveal' | 'settings'

/**
 * Opens the system share sheet with links to WitnessWork on both stores, so one
 * message works for a friend on either platform. Android's share sheet doesn't
 * say whether anything was sent, so there every completion reads as `shared`.
 */
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
