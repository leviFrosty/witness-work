import { Platform } from 'react-native'
import links from '@/constants/links'
import { openURL } from '@/lib/links'
import i18n from '@/lib/locales'

/**
 * Opens WitnessWork in this platform's store: Google Play on Android, the App
 * Store elsewhere. `review` lands on the App Store's write-a-review page; Play
 * has no such link, so Android opens the listing. When the store can't open,
 * the alert tells the User to find the app there themselves.
 */
export const openStoreListing = (options?: {
  review?: boolean
  /** Alert title when the store can't open. */
  title?: string
}) => {
  const android = Platform.OS === 'android'
  const url = android
    ? links.playStore
    : options?.review
      ? links.appStoreReview
      : links.appStore
  return openURL(url, {
    alert: {
      title: options?.title ?? i18n.t('failedToOpenLink'),
      description: i18n.t(
        android
          ? 'updateRequired_storeFailedAndroid'
          : 'updateRequired_storeFailed'
      ),
    },
  })
}
