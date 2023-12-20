import { Alert, Platform, Switch, View } from 'react-native'
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
import Select from '../components/Select'
import { usePreferences } from '../stores/preferences'

const Preferences = () => {
  const theme = useTheme()
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [locationEnabled, setLocationEnabled] = useState(false)
  const {
    returnVisitTimeOffset,
    returnVisitNotificationOffset,
    returnVisitAlwaysNotify,
    set,
  } = usePreferences()
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

  const amountOptions = [...Array(1000).keys()].map((value) => ({
    label: `${value}`,
    value,
  }))

  const unitOptions: {
    label: string
    value: moment.unitOfTime.DurationConstructor
  }[] = ['minutes', 'hours', 'days', 'weeks'].map((value) => ({
    label: i18n.t(`${value}_lowercase`),
    value: value as moment.unitOfTime.DurationConstructor,
  }))

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
            <InputRowContainer
              style={{
                flexDirection: 'column',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  {i18n.t('followUpOffset')}
                </Text>
                <View style={{ flex: 1 }}>
                  <Select
                    data={amountOptions}
                    onChange={({ value }) =>
                      set({
                        returnVisitTimeOffset: {
                          ...returnVisitTimeOffset,
                          amount: value,
                        },
                      })
                    }
                    value={returnVisitTimeOffset?.amount}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Select
                    data={unitOptions}
                    onChange={({ value }) =>
                      set({
                        returnVisitTimeOffset: {
                          ...returnVisitTimeOffset,
                          unit: value,
                        },
                      })
                    }
                    value={returnVisitTimeOffset?.unit}
                  />
                </View>
              </View>
              <Text
                style={{
                  fontSize: theme.fontSize('xs'),
                  color: theme.colors.textAlt,
                }}
              >
                {i18n.t('nextVisitOffset_description')}
              </Text>
            </InputRowContainer>

            <InputRowContainer
              lastInSection
              style={{
                flexDirection: 'column',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  {i18n.t('notificationOffset')}
                </Text>
                <View style={{ flex: 1 }}>
                  <Select
                    data={amountOptions}
                    onChange={({ value }) =>
                      set({
                        returnVisitNotificationOffset: {
                          ...returnVisitNotificationOffset,
                          amount: value,
                        },
                      })
                    }
                    value={returnVisitNotificationOffset?.amount}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Select
                    data={unitOptions}
                    onChange={({ value }) =>
                      set({
                        returnVisitNotificationOffset: {
                          ...returnVisitNotificationOffset,
                          unit: value,
                        },
                      })
                    }
                    value={returnVisitNotificationOffset?.unit}
                  />
                </View>
                <Text style={{ color: theme.colors.textAlt }}>
                  {i18n.t('before')}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: theme.fontSize('xs'),
                  color: theme.colors.textAlt,
                }}
              >
                {i18n.t('notificationOffset_description')}
              </Text>
            </InputRowContainer>
            <InputRowContainer
              lastInSection
              label={i18n.t('alwaysNotify')}
              style={{ justifyContent: 'space-between' }}
            >
              <Switch
                value={returnVisitAlwaysNotify}
                onValueChange={(value) =>
                  set({ returnVisitAlwaysNotify: value })
                }
              />
            </InputRowContainer>
          </Section>
        </View>
        {Platform.OS !== 'android' && (
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
        )}
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
