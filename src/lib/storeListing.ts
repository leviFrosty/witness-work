import { Platform } from 'react-native'
import links from '@/constants/links'
import { openURL } from '@/lib/links'
import i18n from '@/lib/locales'
import { hasCapability } from '@/lib/platformCapabilities'

/**
 * Opens WitnessWork in this platform's store: Google Play on Android, the App
 * Store elsewhere. `review` lands on the App Store's write-a-review page; Play
 * has no such link, so Android opens the listing. Android asks the Play Store
 * app first, since its web link may open in a browser, and falls back to the
 * web link without one. When the store can't open, the alert tells the User to
 * find the app there themselves.
 */
export const openStoreListing = (options?: {
  review?: boolean
  /** Alert title when the store can't open. */
  title?: string
}) => {
  const android = Platform.OS === 'android'
  const url = android
    ? links.playStoreApp
    : options?.review
      ? links.appStoreReview
      : links.appStore
  return openURL(url, {
    ...(android && { fallbackUrl: links.playStore }),
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

/**
 * Gets the newest version of the app: the store listing on a phone, and on the
 * web a reload, since each page load runs the newest deploy (ADR 0037).
 */
export const openAppUpdate = (options?: { title?: string }) => {
  if (hasCapability('storeListings')) return openStoreListing(options)
  window.location.reload()
  return Promise.resolve()
}
