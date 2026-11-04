import { Alert } from 'react-native'
import * as Location from 'expo-location'
import { openAppSettings } from '@/lib/openAppSettings'
import i18n from '@/lib/locales'

/** Explains that location is off and offers this app's page in Settings. */
export const offerLocationSettings = () =>
  Alert.alert(
    i18n.t('locationSharingDisabled'),
    i18n.t('locationSettings_description'),
    [
      { text: i18n.t('cancel'), style: 'cancel' },
      {
        text: i18n.t('locationDisabled_callToAction'),
        onPress: () => void openAppSettings(),
      },
    ]
  )

/**
 * Asks for location from a tap. Once the system won't show its prompt again
 * (after one denial on iOS, or two on Android) it offers Settings instead of
 * doing nothing. Resolves whether location is allowed.
 */
export async function requestOrOfferLocationSettings(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync()
  if (current.granted) return true
  // Someone who just answered the system prompt isn't sent to Settings too.
  if (current.canAskAgain)
    return (await Location.requestForegroundPermissionsAsync()).granted
  offerLocationSettings()
  return false
}
