import * as Linking from 'expo-linking'
import { Alert, AlertButton } from 'react-native'
import { errorTracking } from '@/lib/errorTracking'
import i18n from '@/lib/locales'

export const linkOrigin = (url: string) => {
  const match = /^([a-z][a-z\d+.-]*:)(?:\/\/(?:[^/?#@]*@)?([^/?#]*))?/i.exec(
    url
  )
  if (!match) return '[link]'
  return match[2] ? `${match[1]}//${match[2]}` : match[1]
}

export const openURL = async (
  url: string,
  options?: {
    alert?: {
      title?: string
      description?: string
      buttons?: AlertButton[]
    }

    fallbackUrl?: string
  }
): Promise<boolean> => {
  try {
    await Linking.openURL(url)
    return true
  } catch {}
  if (options?.fallbackUrl) {
    try {
      await Linking.openURL(options.fallbackUrl)
      return true
    } catch {}
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
