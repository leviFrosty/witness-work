import AnimatedLottieView from 'lottie-react-native'
import Text from '@/components/MyText'
import Wrapper from '@/components/layout/Wrapper'
import i18n from '@/lib/locales'
import { View } from 'react-native'
import ActionButton from '@/components/ActionButton'
import useTheme from '@/contexts/theme'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import XView from '@/components/layout/XView'
import Button from '@/components/Button'
import { useCallback } from 'react'
import Accordion from '@/components/Accordion'
import { useNavigation } from '@react-navigation/native'
import Copyeable from '@/components/Copyeable'
import { email } from '@/constants/contactInformation'
import { openURL } from '@/lib/links'
import Card from '@/components/Card'
import ShareAppButton from '@/features/supporter/components/ShareAppButton'
import Divider from '@/components/Divider'
import { RootStackNavigation } from '@/types/rootStack'

const DonationInfoScreen = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()

  const handleEmail = useCallback(() => {
    const subject = encodeURIComponent('[WitnessWork]')
    openURL(`mailto:${email}?subject=${subject}`, {
      alert: {
        title: i18n.t('failedToOpenMailApplication'),
        description: i18n.t('failedToOpenMailApplication_description'),
      },
    })
  }, [])

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
              style={{
                justifyContent: 'space-between',
                paddingHorizontal: 15,
                position: 'relative',
              }}
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
                source={require('@/assets/lottie/floatingHearts.json')}
                style={{
                  position: 'absolute',
                  right: 5,
                  zIndex: -100,
                  height: 100,
                  width: 50,
                }}
                autoPlay
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
                const subject = encodeURIComponent('[WitnessWork]')
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
                <Text style={{ fontFamily: theme.fonts.semiBold }}>
                  {i18n.t('donate_faq3')}
                </Text>
              }
            >
              <Text>{i18n.t('donate_faqAnswer3')}</Text>
            </Accordion>
            <Accordion
              style={{ flexShrink: 1 }}
              header={
                <Text style={{ fontFamily: theme.fonts.semiBold }}>
                  {i18n.t('donate_faq5')}
                </Text>
              }
            >
              <Text>{i18n.t('donate_faqAnswer5')}</Text>
            </Accordion>
            <Accordion
              style={{ flexShrink: 1 }}
              header={
                <Text style={{ fontFamily: theme.fonts.semiBold }}>
                  {i18n.t('donate_faq4')}
                </Text>
              }
            >
              <Text>{i18n.t('donate_faqAnswer4')}</Text>
            </Accordion>
            <Accordion
              style={{ flexShrink: 1 }}
              header={
                <Text style={{ fontFamily: theme.fonts.semiBold }}>
                  {i18n.t('donate_faq1')}
                </Text>
              }
            >
              <Text>{i18n.t('donate_faqAnswer1')}</Text>
            </Accordion>
            <Accordion
              style={{ flexShrink: 1 }}
              header={
                <Text style={{ fontFamily: theme.fonts.semiBold }}>
                  {i18n.t('donate_faq2')}
                </Text>
              }
            >
              <Text>{i18n.t('donate_faqAnswer2')}</Text>
            </Accordion>
          </View>
        </View>
      </KeyboardAwareScrollView>

      <View style={{ paddingHorizontal: 15, gap: 8 }}>
        <ActionButton
          onPress={() =>
            navigation.navigate('Paywall', { initialTier: 'supporter' })
          }
        >
          {i18n.t('becomeSupporter')}
        </ActionButton>
        <Button
          onPress={() => navigation.navigate('Paywall', { initialTier: 'tip' })}
          style={{
            backgroundColor: theme.colors.backgroundLighter,
            borderRadius: theme.numbers.borderRadiusSm,
            paddingVertical: 12,
            paddingHorizontal: 24,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('md'),
              color: theme.colors.text,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('paywallCtaSendTip')}
          </Text>
        </Button>
      </View>
    </Wrapper>
  )
}

export default DonationInfoScreen
