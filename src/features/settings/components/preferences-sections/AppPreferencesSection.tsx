import {
  Bell as BellIcon,
  BellOff as BellOffIcon,
  LocateFixed as LocateFixedIcon,
  Navigation as NavigationIcon,
} from 'lucide-react-native'
import { Alert, AppState } from 'react-native'
import { openAppSettings } from '@/lib/openAppSettings'
import i18n from '@/lib/locales'
import { GroupedListRow, GroupedListSection } from '@/components/ui/GroupedList'
import { requestOrOfferLocationSettings } from '@/lib/locationPermission'
import { useEffect, useState } from 'react'
import * as Location from 'expo-location'
import useNotifications from '@/hooks/notifications'
import { hasCapability } from '@/lib/platformCapabilities'

const AppPreferencesSection = () => {
  const notifications = useNotifications()
  const [locationEnabled, setLocationEnabled] = useState(false)

  useEffect(() => {
    let active = true
    const updateLocationStatus = async () => {
      const { granted } = await Location.getForegroundPermissionsAsync()
      if (active) setLocationEnabled(granted)
    }

    void updateLocationStatus()
    // Re-read on return from Settings, where location may have been allowed.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void updateLocationStatus()
    })
    return () => {
      active = false
      subscription.remove()
    }
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
          onPress: () => openAppSettings(),
        },
      ]
    )
  }

  return (
    <GroupedListSection>
      {hasCapability('deviceNotifications') && (
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
      )}
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
            : async () =>
                setLocationEnabled(await requestOrOfferLocationSettings())
        }
      />
    </GroupedListSection>
  )
}
export default AppPreferencesSection
