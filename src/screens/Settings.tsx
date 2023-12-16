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
import * as Updates from 'expo-updates'
import links from '../constants/links'
import IconButton from '../components/IconButton'
import {
  faBug,
  faChevronRight,
  faCode,
  faDownload,
  faFileContract,
  faGlobe,
  faHeart,
  faHourglassHalf,
  faTools,
  faUndo,
  faHand,
  faCog,
} from '@fortawesome/free-solid-svg-icons'
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
} from '@react-navigation/drawer'

const Settings = (props: DrawerContentComponentProps) => {
  const theme = useTheme()
  const { set: setPreferences } = usePreferences()

  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()

  const resetToOnboarding = () => {
    setPreferences({ onboardingComplete: false })
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
      <DrawerContentScrollView
        contentContainerStyle={{
          paddingTop: 60,
          paddingBottom: 60,
          paddingStart: 0,
        }}
        {...props}
      >
        <View style={{ gap: 25 }}>
          <View style={{ gap: 3 }}>
            <Section>
              <InputRowButton
                leftIcon={faCog}
                label={i18n.t('preferences')}
                onPress={() => navigation.navigate('Preferences')}
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
              {i18n.t('app')}
            </Text>
            <Section>
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
              {i18n.t('contact')}
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
                lastInSection
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
        <Text
          style={{
            textAlign: 'center',
            color: theme.colors.textAlt,
            fontFamily: theme.fonts.semiBold,
            fontSize: 14,
            marginTop: 15,
            marginBottom: 45,
          }}
        >
          {Constants.expoConfig?.version
            ? `v${Constants.expoConfig?.version}`
            : i18n.t('versionUnknown')}
        </Text>
      </DrawerContentScrollView>
    </View>
  )
}

export default Settings
