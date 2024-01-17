import * as Linking from 'expo-linking'
import { Alert, AlertButton } from 'react-native'
import * as Sentry from 'sentry-expo'
import i18n from './locales'

/** Opens a URI or URL and handles when it cannot be opened. */
export const openURL = async (
  url: string,
  options?: {
    /** Alert options for the case that the link cannot be opened. */
    alert?: {
      title?: string
      description?: string
      buttons?: AlertButton[]
    }
  }
) => {
  try {
    const canOpen = await Linking.canOpenURL(url)

    if (canOpen) {
      await Linking.openURL(url)
    } else {
      throw new Error()
    }
  } catch (error) {
    Alert.alert(
      options?.alert?.title ?? i18n.t('failedToOpenLink'),
      options?.alert?.description ?? i18n.t('failedToOpenLink_description'),
      options?.alert?.buttons
    )
    Sentry.Native.captureException(error)
  }
}
