import { Platform } from 'react-native'
import links from '@/constants/links'
import { openURL } from '@/lib/links'
import i18n from '@/lib/locales'

export const openStoreListing = (options?: {
  review?: boolean

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
