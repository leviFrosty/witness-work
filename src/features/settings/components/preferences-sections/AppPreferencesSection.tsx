import { Alert, View } from 'react-native'
import * as Linking from 'expo-linking'
import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
import { requestLocationPermission } from '@/lib/address'
import IconButton from '@/components/ui/IconButton'
import { faBell } from '@fortawesome/free-solid-svg-icons/faBell'
import { faBellSlash } from '@fortawesome/free-solid-svg-icons/faBellSlash'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons/faChevronRight'
import { faLocationArrow } from '@fortawesome/free-solid-svg-icons/faLocationArrow'
import { faLocationCrosshairs } from '@fortawesome/free-solid-svg-icons/faLocationCrosshairs'
import { useEffect, useState } from 'react'
import * as Location from 'expo-location'
import useNotifications from '@/hooks/notifications'

const AppPreferencesSection = () => {
  const notifications = useNotifications()
  const [locationEnabled, setLocationEnabled] = useState(false)

  useEffect(() => {
    const updateLocationStatus = async () => {
      const { granted } = await Location.getForegroundPermissionsAsync()

      if (granted) {
        setLocationEnabled(true)
      }
    }

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
      <Section>
        <InputRowButton
          leftIcon={notifications.allowed ? faBell : faBellSlash}
          label={
            notifications.allowed
              ? i18n.t('pushNotificationsEnabled')
              : i18n.t('pushNotificationsDisabled')
          }
          onPress={notifications.allowed ? undefined : askToTakeToSettings}
        >
          {!notifications.allowed && <IconButton icon={faChevronRight} />}
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
