import { Alert, View } from 'react-native'
import Text from '../components/MyText'
import Wrapper from '../components/Wrapper'
import Section from '../components/inputs/Section'
import i18n from '../lib/locales'
import useTheme from '../contexts/theme'
import DefaultNavigationSelector from '../components/DefaultNavigationSelector'
import InputRowContainer from '../components/inputs/InputRowContainer'
import PublisherTypeSelector from '../components/PublisherTypeSelector'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import InputRowButton from '../components/inputs/InputRowButton'
import {
  faBell,
  faBellSlash,
  faChevronRight,
  faLocationArrow,
  faLocationCrosshairs,
} from '@fortawesome/free-solid-svg-icons'
import IconButton from '../components/IconButton'
import * as Linking from 'expo-linking'
import { requestLocationPermission } from '../lib/address'
import { useEffect, useState } from 'react'
import * as Location from 'expo-location'
import * as Notifications from 'expo-notifications'

const Preferences = () => {
  const theme = useTheme()
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
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        contentContainerStyle={{ gap: 30, paddingTop: 30 }}
      >
        <View style={{ gap: 3 }}>
          <Text
            style={{
              marginLeft: 20,
              fontFamily: theme.fonts.semiBold,
              fontSize: 12,
              color: theme.colors.textAlt,
              textTransform: 'uppercase',
            }}
          >
            {i18n.t('publisher')}
          </Text>
          <Section>
            <InputRowContainer label={i18n.t('status')} lastInSection>
              <View style={{ flex: 1 }}>
                <PublisherTypeSelector />
              </View>
            </InputRowContainer>
          </Section>
        </View>

        <View style={{ gap: 3 }}>
          <Text
            style={{
              marginLeft: 20,
              fontFamily: theme.fonts.semiBold,
              fontSize: 12,
              color: theme.colors.textAlt,
              textTransform: 'uppercase',
            }}
          >
            {i18n.t('conversations')}
          </Text>
          <Section>
            <InputRowContainer label={i18n.t('nextVisitOffset')}>
              <View></View>
            </InputRowContainer>
          </Section>
        </View>
        <View style={{ gap: 3 }}>
          <Text
            style={{
              marginLeft: 20,
              fontFamily: theme.fonts.semiBold,
              fontSize: 12,
              color: theme.colors.textAlt,
              textTransform: 'uppercase',
            }}
          >
            {i18n.t('navigation')}
          </Text>
          <Section>
            <DefaultNavigationSelector />
          </Section>
        </View>
        <View style={{ gap: 3 }}>
          <Text
            style={{
              marginLeft: 20,
              fontFamily: theme.fonts.semiBold,
              fontSize: 12,
              color: theme.colors.textAlt,
              textTransform: 'uppercase',
            }}
          >
            {i18n.t('app')}
          </Text>
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
              leftIcon={
                locationEnabled ? faLocationArrow : faLocationCrosshairs
              }
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
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default Preferences
