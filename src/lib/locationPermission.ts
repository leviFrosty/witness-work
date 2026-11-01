import { Alert, Linking } from 'react-native'
import * as Location from 'expo-location'
import i18n from '@/lib/locales'

export const offerLocationSettings = () =>
  Alert.alert(
    i18n.t('locationSharingDisabled'),
    i18n.t('locationSettings_description'),
    [
      { text: i18n.t('cancel'), style: 'cancel' },
      {
        text: i18n.t('locationDisabled_callToAction'),
        onPress: () => void Linking.openSettings(),
      },
    ]
  )

export async function requestOrOfferLocationSettings(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync()
  if (current.granted) return true

  if (current.canAskAgain)
    return (await Location.requestForegroundPermissionsAsync()).granted
  offerLocationSettings()
  return false
}
