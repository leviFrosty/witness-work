import { Platform, View, Alert } from 'react-native'
import Text from '../components/MyText'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '../contexts/theme'
import Section from '../components/inputs/Section'
import { usePreferences } from '../stores/preferences'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../stacks/RootStack'
import i18n from '../lib/locales'
import InputRowButton from '../components/inputs/InputRowButton'
import Constants from 'expo-constants'
import * as Linking from 'expo-linking'
import * as Sentry from 'sentry-expo'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import * as Updates from 'expo-updates'
import { useEffect, useState } from 'react'
import links from '../constants/links'
import InputRowContainer from '../components/inputs/InputRowContainer'
import PublisherTypeSelector from '../components/PublisherTypeSelector'
import IconButton from '../components/IconButton'
import {
  faBug,
  faBellSlash,
  faBell,
  faChevronRight,
  faCode,
  faDownload,
  faFileContract,
  faGlobe,
  faLocationArrow,
  faLocationCrosshairs,
  faHeart,
  faHourglassHalf,
  faTools,
  faUndo,
  faHand,
} from '@fortawesome/free-solid-svg-icons'
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
} from '@react-navigation/drawer'
import * as Location from 'expo-location'
import { requestLocationPermission } from '../lib/address'

const Settings = (props: DrawerContentComponentProps) => {
  const theme = useTheme()
  const { set: setPreferences } = usePreferences()
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [locationEnabled, setLocationEnabled] = useState(false)
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()

  const resetToOnboarding = () => {
    setPreferences({ onboardingComplete: false })
  }

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

  const fetchUpdate = async () => {
    if (__DEV__) {
      return Alert.alert('Cannot update in dev mode.')
    }

    try {
      const update = await Updates.checkForUpdateAsync()
      if (update.isAvailable) {
        navigation.navigate('Update')
      }
      Alert.alert(i18n.t('noUpdateAvailable'))
    } catch (error) {
      Alert.alert(
        `${i18n.t('updateViaThe')} ${
          Platform.OS === 'android' ? 'Play Store' : 'App Store'
        }`,
        `${i18n.t('update_error')} ${error}`
      )
      Sentry.Native.captureException(error)
    }
  }

  return (
    <View
      style={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        backgroundColor: theme.colors.background,
        flexGrow: 1,
        justifyContent: 'space-between',
      }}
    >
      <Text
        style={{
          marginHorizontal: 20,
          marginTop: 20,
          marginBottom: 10,
          fontSize: 16,
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {i18n.t('settings')}
      </Text>
      <DrawerContentScrollView
        contentContainerStyle={{
          paddingTop: 30,
          paddingBottom: 30,
          paddingStart: 0,
        }}
        {...props}
      >
        <View style={{ gap: 25 }}>
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
              <InputRowButton
                leftIcon={faHourglassHalf}
                label={i18n.t('viewHours')}
                onPress={() => navigation.navigate('Time Reports')}
              >
                <IconButton icon={faChevronRight} />
              </InputRowButton>
              <InputRowButton
                leftIcon={faUndo}
                label={i18n.t('recoverContacts')}
                onPress={() => navigation.navigate('Recover Contacts')}
              >
                <IconButton icon={faChevronRight} />
              </InputRowButton>
              <InputRowButton
                leftIcon={faTools}
                label={i18n.t('restartOnboarding')}
                onPress={resetToOnboarding}
              >
                <IconButton icon={faChevronRight} />
              </InputRowButton>
              <InputRowButton
                leftIcon={faDownload}
                label={i18n.t('checkForUpdate')}
                onPress={fetchUpdate}
                lastInSection
              >
                <IconButton icon={faChevronRight} />
              </InputRowButton>
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
              {i18n.t('support')}
            </Text>
            <Section>
              <InputRowButton
                leftIcon={faHeart}
                label={
                  Platform.OS === 'android'
                    ? i18n.t('rateJWTimeOnPlayStore')
                    : i18n.t('rateJWTimeOnAppStore')
                }
                onPress={() => {
                  try {
                    Platform.OS === 'android'
                      ? Linking.openURL(links.playStoreReview)
                      : Linking.openURL(links.appStoreReview)
                  } catch (error) {
                    Alert.alert(
                      Platform.OS === 'android'
                        ? i18n.t('androidAppStoreReviewErrorTitle')
                        : i18n.t('appleAppStoreReviewErrorTitle'),
                      Platform.OS === 'android'
                        ? i18n.t('androidAppStoreReviewErrorMessage')
                        : i18n.t('appleAppStoreReviewErrorMessage')
                    )
                  }
                }}
              >
                <IconButton icon={faChevronRight} />
              </InputRowButton>
              <InputRowButton
                leftIcon={faGlobe}
                label={i18n.t('helpTranslate')}
                onPress={async () => {
                  const emailMe = async () => {
                    const email = 'levi.wilkerson@proton.me'
                    const subjectText = '[JW Time] Help Translate'
                    const bodyText = `${i18n.t(
                      'iWouldLikeToHelpTranslate'
                    )}: --------------`
                    const subject = encodeURIComponent(subjectText)
                    const body = encodeURIComponent(bodyText)
                    try {
                      await Linking.openURL(
                        `mailto:${email}?subject=${subject}&body=${body}`
                      )
                    } catch (error) {
                      Alert.alert(
                        i18n.t('error'),
                        i18n.t('failedToOpenMailApplication')
                      )
                    }
                  }

                  Alert.alert(
                    i18n.t('helpTranslateTitle'),
                    i18n.t('helpTranslate_message'),
                    [
                      {
                        text: i18n.t('cancel'),
                        style: 'cancel',
                      },
                      {
                        text: i18n.t('yes'),
                        onPress: emailMe,
                      },
                    ]
                  )
                }}
                lastInSection
              >
                <IconButton icon={faChevronRight} />
              </InputRowButton>
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
              {i18n.t('misc')}
            </Text>
            <Section>
              <InputRowButton
                leftIcon={faBug}
                label={i18n.t('bugReport')}
                onPress={async () => {
                  const email = 'levi.wilkerson@proton.me'
                  const subjectText = '[JW Time] Bug Report'
                  const bodyText = `App Version: v${Constants.expoConfig
                    ?.version}, Device: ${Device.modelName}, OS: ${
                    Device.osVersion
                  }. ${i18n.t('pleaseDescribeYourIssue')}: --------------`
                  const subject = encodeURIComponent(subjectText)
                  const body = encodeURIComponent(bodyText)
                  try {
                    await Linking.openURL(
                      `mailto:${email}?subject=${subject}&body=${body}`
                    )
                  } catch (error) {
                    Alert.alert(
                      i18n.t('error'),
                      i18n.t('failedToOpenMailApplication')
                    )
                  }
                }}
              >
                <IconButton icon={faChevronRight} />
              </InputRowButton>
              <InputRowButton
                leftIcon={faHand}
                label={i18n.t('featureRequest')}
                onPress={async () => {
                  const email = 'levi.wilkerson@proton.me'
                  const subjectText = '[JW Time] Feature Request'
                  const bodyText = `App Version: v${Constants.expoConfig
                    ?.version}, Device: ${Device.modelName}, OS: ${
                    Device.osVersion
                  }. ${i18n.t(
                    'pleaseDescribeYourFeatureClearly'
                  )}: --------------`
                  const subject = encodeURIComponent(subjectText)
                  const body = encodeURIComponent(bodyText)
                  try {
                    await Linking.openURL(
                      `mailto:${email}?subject=${subject}&body=${body}`
                    )
                  } catch (error) {
                    Alert.alert(
                      i18n.t('error'),
                      i18n.t('failedToOpenMailApplication')
                    )
                  }
                }}
              >
                <IconButton icon={faChevronRight} />
              </InputRowButton>
              <InputRowButton
                leftIcon={faCode}
                label={i18n.t('viewSource')}
                onPress={() => {
                  try {
                    Linking.openURL(links.githubRepo)
                  } catch (error) {
                    Sentry.Native.captureException(error)
                  }
                }}
              >
                <IconButton icon={faChevronRight} />
              </InputRowButton>
              <InputRowButton
                leftIcon={faFileContract}
                label={i18n.t('privacyPolicy')}
                onPress={() => {
                  try {
                    Linking.openURL(links.privacyPolicy)
                  } catch (error) {
                    Sentry.Native.captureException(error)
                  }
                }}
                lastInSection
              >
                <IconButton icon={faChevronRight} />
              </InputRowButton>
            </Section>
          </View>
        </View>
      </DrawerContentScrollView>
      <View
        style={{ padding: 10, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text
          style={{
            textAlign: 'center',
            color: theme.colors.textAlt,
            fontFamily: theme.fonts.semiBold,
            fontSize: 14,
          }}
        >
          {Constants.expoConfig?.version
            ? `v${Constants.expoConfig?.version}`
            : i18n.t('versionUnknown')}
        </Text>
      </View>
    </View>
  )
}

export default Settings
