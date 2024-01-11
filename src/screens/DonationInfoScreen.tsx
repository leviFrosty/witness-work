import AnimatedLottieView from 'lottie-react-native'
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
import Purchases, { CustomerInfo, LOG_LEVEL } from 'react-native-purchases'
import { useCallback, useEffect, useState } from 'react'
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

const DonationInfoScreen = () => {
  const theme = useTheme()
  const { isTablet, isAndroid } = useDevice()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const [customer, setCustomer] = useState<CustomerInfo>()
  const hasPurchasedBefore =
    (customer?.allPurchaseDates
      ? Object.keys(customer.allPurchaseDates).length
      : 0) > 0

  // Sets up RevenueCat SDK to be used later in paywall screen as well
  // Fetches customer info for previous purchases
  // We do not want to load this at app startup to save performance
  // This also improves performance on paywall because the SDK is already loaded.
  useEffect(() => {
    const setup = async () => {
      if (isAndroid) {
        return
        // For now, android does not support donations.
      } else {
        Purchases.setLogLevel(LOG_LEVEL.DEBUG)
        await Purchases.configure({
          apiKey: process.env.REVENUECAT_APPLE_API_KEY || '',
        })
      }

      const customerInfo = await Purchases.getCustomerInfo()
      setCustomer(customerInfo)
    }

    setup().catch(console.log)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRestore = useCallback(async () => {
    try {
      const restored = await Purchases.restorePurchases()
      setCustomer(restored)
      console.log(JSON.stringify(restored, null, 2))
    } catch (e: unknown) {
      Alert.alert(i18n.t('error_restoring_account'), JSON.stringify(e, null, 2))
    }
  }, [])

  const handleEmail = () => {
    const subject = encodeURIComponent('[JW Time]')
    openURL(`mailto:${email}?subject=${subject}`)
  }

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
                {`${i18n.t('emailMe')} ${email}`}
              </Copyeable>
            </Button>
          </Card>
          <View style={{ gap: 5 }}>
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
          <View style={{ flexDirection: isTablet ? 'row' : 'column', gap: 10 }}>
            <Text
              style={{
                fontSize: theme.fontSize('lg'),
                fontFamily: theme.fonts.semiBold,
                marginBottom: 15,
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

          <Divider />

          {hasPurchasedBefore && customer && !isAndroid ? (
            <PreviousDonations customer={customer} />
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
