import { Alert, View } from 'react-native'
import * as Linking from 'expo-linking'
import i18n from '../../../lib/locales'
import Section from '../../../components/inputs/Section'
import InputRowButton from '../../../components/inputs/InputRowButton'
import { requestLocationPermission } from '../../../lib/address'
import IconButton from '../../../components/IconButton'
import {
  faBell,
  faBellSlash,
  faChevronRight,
  faLocationArrow,
  faLocationCrosshairs,
} from '@fortawesome/free-solid-svg-icons'
import { useEffect, useState } from 'react'
import * as Location from 'expo-location'
import * as Notifications from 'expo-notifications'
import SettingsSectionTitle from '../../settings/shared/SettingsSectionTitle'

const AppPreferencesSection = () => {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [locationEnabled, setLocationEnabled] = useState(false)

  useEffect(() => {
    const updateLocationStatus = async () => {
      const { granted } = await Location.getForegroundPermissionsAsync()

      if (granted) {
        setLocationEnabled(true)
      }
    }

    const updateNotificationsStatus = async () => {
      const settings = await Notifications.getPermissionsAsync()
      if (!settings.granted) {
        return
      }
      setNotificationsEnabled(true)
    }

    updateNotificationsStatus()
    updateLocationStatus()
  }, [])

  const askToTakeToSettings = () => {
    Alert.alert(
      i18n.t('notificationsDisabled'),
      i18n.t('notificationsDisabled_description'),
      [
        {
          text: i18n.t('cancel'),
          style: 'cancel',
        },
        {
          text: i18n.t('yes'),
          style: 'default',
          onPress: () => Linking.openSettings(),
        },
      ]
    )
  }

  return (
    <View style={{ gap: 3 }}>
      <SettingsSectionTitle text={i18n.t('app')} />
      <Section>
        <InputRowButton
          leftIcon={notificationsEnabled ? faBell : faBellSlash}
          label={
            notificationsEnabled
              ? i18n.t('pushNotificationsEnabled')
              : i18n.t('pushNotificationsDisabled')
          }
          onPress={notificationsEnabled ? undefined : askToTakeToSettings}
        >
          {!notificationsEnabled && <IconButton icon={faChevronRight} />}
        </InputRowButton>
        <InputRowButton
          lastInSection
          leftIcon={locationEnabled ? faLocationArrow : faLocationCrosshairs}
          label={
            locationEnabled
              ? i18n.t('locationEnabled')
              : i18n.t('locationDisabled')
          }
          onPress={() =>
            locationEnabled
              ? undefined
              : requestLocationPermission((status) =>
                  setLocationEnabled(status)
                )
          }
        >
          {!locationEnabled && <IconButton icon={faChevronRight} />}
        </InputRowButton>
      </Section>
    </View>
  )
}
export default AppPreferencesSection
