import { Dimensions, View } from 'react-native'
import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import AnimatedLottieView from 'lottie-react-native'
import { useNavigation } from '@react-navigation/native'
import Wrapper from '../components/layout/Wrapper'
import Text from '../components/MyText'
import ActionButton from '../components/ActionButton'
import { RootStackNavigation } from '../types/rootStack'

const PaywallThankYouScreen = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()

  return (
    <Wrapper
      style={{
        paddingTop: 0,
        gap: 10,
        justifyContent: 'space-between',
        position: 'relative',
      }}
    >
      <View style={{ paddingTop: 30, flexGrow: 1 }}>
        <View
          style={{
            alignItems: 'center',
            gap: 20,
            flexGrow: 1,
            justifyContent: 'center',
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

          <Text style={{ textAlign: 'center', maxWidth: 250 }}>
            {i18n.t('thankYou_description')}
          </Text>
        </View>
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
      </View>
      <View style={{ paddingHorizontal: 15, paddingBottom: 10 }}>
        <ActionButton onPress={() => navigation.navigate('Root')}>
          {i18n.t('goHome')}
        </ActionButton>
      </View>
    </Wrapper>
  )
}

export default PaywallThankYouScreen
