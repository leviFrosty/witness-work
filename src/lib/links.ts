import * as Linking from 'expo-linking'
import { Alert, AlertButton } from 'react-native'
import { errorTracking } from '@/lib/errorTracking'
import i18n from '@/lib/locales'

/**
 * A link's scheme and host, which is all a failure report may show. The rest is
 * a contact's address (map links) or phone number (`tel:`, `sms:`), and the OS
 * error repeats the whole link, so it's never sent either.
 */
export const linkOrigin = (url: string) => {
  const match = /^([a-z][a-z\d+.-]*:)(?:\/\/(?:[^/?#@]*@)?([^/?#]*))?/i.exec(
    url
  )
  if (!match) return '[link]'
  return match[2] ? `${match[1]}//${match[2]}` : match[1]
}

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
    /** Tried when `url` can't be opened, before the alert. */
    fallbackUrl?: string
  }
): Promise<boolean> => {
  try {
    await Linking.openURL(url)
    return true
  } catch {
    // The device can't open it (the app is deleted or restricted).
  }
  if (options?.fallbackUrl) {
    try {
      await Linking.openURL(options.fallbackUrl)
      return true
    } catch {
      // Same as above; the alert covers both.
    }
  }
  Alert.alert(
    options?.alert?.title ?? i18n.t('failedToOpenLink'),
    options?.alert?.description ?? i18n.t('failedToOpenLink_description'),
    options?.alert?.buttons
  )
  errorTracking.captureException(
    new Error(`Could not open link (${linkOrigin(url)})`),
    options?.fallbackUrl
      ? { fallback_origin: linkOrigin(options.fallbackUrl) }
      : undefined
  )
  return false
}
