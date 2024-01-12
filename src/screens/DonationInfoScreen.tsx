import AnimatedLottieView from 'lottie-react-native'
import * as Sentry from 'sentry-expo'
import Text from '../components/MyText'
import Wrapper from '../components/layout/Wrapper'
import i18n from '../lib/locales'
import { Alert, View } from 'react-native'
import ActionButton from '../components/ActionButton'
import links from '../constants/links'
import useTheme from '../contexts/theme'
import useDevice from '../hooks/useDevice'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import XView from '../components/layout/XView'
import Button from '../components/Button'
import Purchases from 'react-native-purchases'
import React, { useCallback } from 'react'
import Accordion from '../components/Accordion'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../stacks/RootStack'
import Copyeable from '../components/Copyeable'
import { email } from '../constants/contactInformation'
import { openURL } from '../lib/links'
import Card from '../components/Card'
import ShareAppButton from '../components/ShareAppButton'
import Divider from '../components/Divider'
import PreviousDonations from '../components/PreviousDonations'
import useCustomer from '../hooks/useCustomer'

const DonationInfoScreen = () => {
  const theme = useTheme()
  const { isAndroid } = useDevice()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const { customer, setCustomer, hasPurchasedBefore, revalidate } =
    useCustomer()

  const handleRestore = useCallback(async () => {
    try {
      const restored = await Purchases.restorePurchases()
      if (Object.keys(restored.allPurchaseDates).length === 0) {
        Alert.alert(i18n.t('noPurchasesFound'))
      }
      setCustomer(restored)
    } catch (error: unknown) {
      Sentry.Native.captureException(error)
      Alert.alert(i18n.t('error_restoring_account'))
    }
  }, [setCustomer])

  const handleEmail = useCallback(() => {
    const subject = encodeURIComponent('[JW Time]')
    openURL(`mailto:${email}?subject=${subject}`, {
      alert: {
        title: i18n.t('failedToOpenMailApplication'),
        description: i18n.t('failedToOpenMailApplication_description'),
      },
    })
  }, [])

  const renderPreviousDonations = useCallback(() => {
    if (isAndroid) {
      return null
    }

    return (
      <React.Fragment>
        <Divider />
        {hasPurchasedBefore && customer ? (
          <PreviousDonations customer={customer} revalidate={revalidate} />
        ) : (
          <Button onPress={handleRestore}>
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                textDecorationLine: 'underline',
                textAlign: 'center',
              }}
            >
              {i18n.t('restorePurchase')}
            </Text>
          </Button>
        )}
      </React.Fragment>
    )
  }, [
    customer,
    handleRestore,
    hasPurchasedBefore,
    isAndroid,
    revalidate,
    theme,
  ])

  return (
    <Wrapper
      style={{
        paddingTop: 0,
        paddingBottom: insets.bottom + 10,
        justifyContent: 'space-between',
        flex: 1,
        position: 'relative',
      }}
    >
      <KeyboardAwareScrollView
        contentContainerStyle={{
          paddingTop: 30,
          paddingHorizontal: 15,
          paddingBottom: insets.bottom + 100,
        }}
      >
        <View style={{ gap: 30 }}>
          <View>
            <XView
              style={{ justifyContent: 'space-between', paddingHorizontal: 15 }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('2xl'),
                  fontFamily: theme.fonts.bold,
                }}
              >
                {i18n.t('aLetterForYou')}
              </Text>
              <AnimatedLottieView
                source={require('../assets/lottie/floatingHearts.json')}
                style={{
                  position: 'absolute',
                  right: 5,
                  zIndex: -100,
                  height: 100,
                }}
                autoPlay
                autoSize
                loop
              />
            </XView>
          </View>
          <Card>
            <Copyeable>{i18n.t('donate_letter')}</Copyeable>
            <Text style={{ fontSize: theme.fontSize('sm'), marginTop: 20 }}>
              {i18n.t('donate_letter_ps')}
            </Text>
            <Button
              onPress={() => {
                const subject = encodeURIComponent('[JW Time]')
                openURL(`mailto:${email}?subject=${subject}`, {
                  alert: {
                    description: i18n.t('failedToOpenMailApplication'),
                  },
                })
              }}
            >
              <Copyeable
                text={email}
                onPress={handleEmail}
                textProps={{
                  onPress: handleEmail,
                  style: {
                    fontSize: theme.fontSize('sm'),
                    textDecorationLine: 'underline',
                  },
                }}
              >
                {email}
              </Copyeable>
            </Button>
          </Card>
          <View style={{ gap: 5, paddingHorizontal: 10 }}>
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('donate_description')}
            </Text>
            <ShareAppButton />
          </View>
          <Divider />
          <View style={{ gap: 10 }}>
            <Text
              style={{
                fontSize: theme.fontSize('lg'),
                fontFamily: theme.fonts.semiBold,
                paddingBottom: 15,
              }}
            >
              {i18n.t('frequentlyAskedQuestions')}
            </Text>
            <Accordion
              style={{ flexShrink: 1 }}
              header={
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('donate_faq1')}
                </Text>
              }
            >
              <Text>{i18n.t('donate_faqAnswer1')}</Text>
            </Accordion>
            <Accordion
              style={{ flexShrink: 1 }}
              header={
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('donate_faq2')}
                </Text>
              }
            >
              <Text>{i18n.t('donate_faqAnswer2')}</Text>
            </Accordion>
          </View>

          {renderPreviousDonations()}
        </View>
      </KeyboardAwareScrollView>

      <View style={{ paddingHorizontal: 15, gap: 5 }}>
        <ActionButton
          onPress={() =>
            isAndroid ? openURL(links.donate) : navigation.navigate('Paywall')
          }
        >
          {i18n.t('donate')}
        </ActionButton>
      </View>
    </Wrapper>
  )
}

export default DonationInfoScreen
