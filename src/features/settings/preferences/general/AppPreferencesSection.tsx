import {
  LocateFixed as LocateFixedIcon,
  Navigation as NavigationIcon,
} from 'lucide-react-native'
import { AppState } from 'react-native'
import i18n from '@/lib/locales'
import { GroupedListRow, GroupedListSection } from '@/components/ui/GroupedList'
import { requestOrOfferLocationSettings } from '@/lib/locationPermission'
import { useEffect, useState } from 'react'
import * as Location from 'expo-location'

const AppPreferencesSection = () => {
  const [locationEnabled, setLocationEnabled] = useState(false)

  useEffect(() => {
    let active = true
    const updateLocationStatus = async () => {
      const { granted } = await Location.getForegroundPermissionsAsync()
      if (active) setLocationEnabled(granted)
    }

    void updateLocationStatus()

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void updateLocationStatus()
    })
    return () => {
      active = false
      subscription.remove()
    }
  }, [])

  return (
    <GroupedListSection>
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
