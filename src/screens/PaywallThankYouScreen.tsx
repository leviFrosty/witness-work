import { Dimensions, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import AnimatedLottieView from 'lottie-react-native'
import { useNavigation } from '@react-navigation/native'
import Wrapper from '../components/layout/Wrapper'
import Text from '../components/MyText'
import ActionButton from '../components/ActionButton'
import SupporterBenefits from '../components/SupporterBenefits'
import SupporterBadge from '../components/SupporterBadge'
import useIsSupporter from '../hooks/useIsSupporter'
import { RootStackNavigation } from '../types/rootStack'

const PaywallThankYouScreen = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const { isSupporter } = useIsSupporter()
  const canGoBack = navigation.canGoBack()

  return (
    <Wrapper
      style={{
        paddingTop: 0,
        gap: 10,
        justifyContent: 'space-between',
        position: 'relative',
      }}
    >
      <AnimatedLottieView
        source={require('../assets/lottie/floatingHearts.json')}
        style={{
          position: 'absolute',
          right: 5,
          opacity: 0.4,
          zIndex: -100,
          height: Dimensions.get('screen').height,
          width: Dimensions.get('screen').width,
        }}
        autoPlay
        loop
      />
      <ScrollView
        contentContainerStyle={{
          paddingTop: 30,
          paddingHorizontal: 20,
          paddingBottom: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            alignItems: 'center',
            gap: 16,
            paddingTop: 20,
            paddingBottom: 30,
          }}
        >
          <View style={{ position: 'relative' }}>
            <Text
              style={{
                fontSize: theme.fontSize('4xl'),
                fontFamily: theme.fonts.bold,
              }}
            >
              {i18n.t('thankYou')}
            </Text>
            <AnimatedLottieView
              autoPlay
              loop={true}
              style={{
                position: 'absolute',
                width: 100,
                top: -10,
                right: -5,
              }}
              source={require('./../assets/lottie/confetti.json')}
            />
          </View>

          {isSupporter && <SupporterBadge size='md' />}

          <Text style={{ textAlign: 'center', maxWidth: 280 }}>
            {isSupporter
              ? i18n.t('thankYou_description')
              : i18n.t('thankYou_oneTimeDescription')}
          </Text>
          {isSupporter && (
            <Text
              style={{
                textAlign: 'center',
                maxWidth: 280,
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('thankYou_benefitsIntro')}
            </Text>
          )}
        </View>

        {isSupporter && <SupporterBenefits />}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: 15,
          paddingBottom: insets.bottom + 10,
        }}
      >
        <ActionButton
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack()
            } else {
              navigation.navigate('Root')
            }
          }}
        >
          {canGoBack ? i18n.t('goBack') : i18n.t('goHome')}
        </ActionButton>
      </View>
    </Wrapper>
  )
}

export default PaywallThankYouScreen
