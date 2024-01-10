import AnimatedLottieView from 'lottie-react-native'
import Text from '../components/MyText'
import Wrapper from '../components/layout/Wrapper'
import i18n from '../lib/locales'
import { Share, View } from 'react-native'
import ActionButton from '../components/ActionButton'
import { openURL } from '../lib/links'
import links from '../constants/links'
import Card from '../components/Card'
import useTheme from '../contexts/theme'
import useDevice from '../hooks/useDevice'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import XView from '../components/layout/XView'
import Button from '../components/Button'

const DonationScreen = () => {
  const theme = useTheme()
  const { isTablet, isAndroid } = useDevice()
  const insets = useSafeAreaInsets()

  return (
    <Wrapper
      style={{
        paddingTop: 30,
        paddingHorizontal: 15,
        paddingBottom: insets.bottom + 30,
      }}
    >
      <KeyboardAwareScrollView>
        <View style={{ gap: 50 }}>
          <View style={{ gap: 5 }}>
            <XView style={{ justifyContent: 'space-between' }}>
              <View style={{ gap: 15, flex: 1 }}>
                <Text
                  style={{
                    fontSize: theme.fontSize('2xl'),
                    fontFamily: theme.fonts.bold,
                  }}
                >
                  {i18n.t('donate_thankYou')}
                </Text>
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {i18n.t('donate_description')}
                </Text>
              </View>
              <AnimatedLottieView
                source={require('../assets/lottie/floatingHearts.json')}
                style={{
                  height: 150,
                }}
                autoPlay
                autoSize
                loop
              />
            </XView>
            <Button
              onPress={() =>
                Share.share({
                  url: isAndroid ? links.playStore : links.appStore,
                })
              }
            >
              <Text style={{ textDecorationLine: 'underline' }}>
                {i18n.t('shareApp')}
              </Text>
            </Button>
          </View>
          <View style={{ flexDirection: isTablet ? 'row' : 'column', gap: 10 }}>
            <Card style={{ flexShrink: 1 }}>
              <Text
                style={{
                  fontSize: theme.fontSize('lg'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('donate_faq1')}
              </Text>
              <Text>{i18n.t('donate_faqAnswer1')}</Text>
            </Card>
            <Card style={{ flexShrink: 1 }}>
              <Text
                style={{
                  fontSize: theme.fontSize('lg'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('donate_faq2')}
              </Text>
              <Text>{i18n.t('donate_faqAnswer2')}</Text>
            </Card>
          </View>
        </View>
      </KeyboardAwareScrollView>
      <ActionButton onPress={() => openURL(links.donate)}>
        <Text
          style={{
            fontSize: theme.fontSize('lg'),
            color: theme.colors.textInverse,
            fontFamily: theme.fonts.bold,
          }}
        >
          {i18n.t('openDonationPage')}
        </Text>
      </ActionButton>
    </Wrapper>
  )
}

export default DonationScreen
