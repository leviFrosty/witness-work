import {
  Bell as BellIcon,
  BellOff as BellOffIcon,
  LocateFixed as LocateFixedIcon,
  Navigation as NavigationIcon,
} from 'lucide-react-native'
import { Alert } from 'react-native'
import * as Linking from 'expo-linking'
import i18n from '@/lib/locales'
import { GroupedListRow, GroupedListSection } from '@/components/ui/GroupedList'
import { requestLocationPermission } from '@/lib/address'
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
    <GroupedListSection>
      <GroupedListRow
        icon={notifications.allowed ? BellIcon : BellOffIcon}
        label={
          notifications.allowed
            ? i18n.t('pushNotificationsEnabled')
            : i18n.t('pushNotificationsDisabled')
        }
        onPress={
          notifications.allowed
            ? undefined
            : notifications.canAskAgain
              ? () => void notifications.register()
              : askToTakeToSettings
        }
      />
      <GroupedListRow
        icon={locationEnabled ? NavigationIcon : LocateFixedIcon}
        label={
          locationEnabled
            ? i18n.t('locationEnabled')
            : i18n.t('locationDisabled')
        }
        onPress={
          locationEnabled
            ? undefined
            : () =>
                requestLocationPermission((status) =>
                  setLocationEnabled(status)
                )
        }
      />
    </GroupedListSection>
  )
}
export default AppPreferencesSection
