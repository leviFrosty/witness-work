import { View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { styles } from '../Onboarding.styles'
import OnboardingNav from '../OnboardingNav'
import Text from '../../MyText'
import i18n from '../../../lib/locales'
import PublisherTypeSelector from '../../PublisherTypeSelector'
import Wrapper from '../../layout/Wrapper'
import ActionButton from '../../ActionButton'
import FeatureShowcase from '../FeatureShowcase'

interface Props {
  goBack: () => void
  goNext: () => void
}

const StepTwo = ({ goBack, goNext }: Props) => {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Wrapper
          style={{
            flex: 1,
            paddingHorizontal: 30,
            paddingTop: 60,
            paddingBottom: 60,
          }}
        >
          <OnboardingNav goBack={goBack} />
          <KeyboardAwareScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexGrow: 1,
              paddingTop: 30,
              paddingBottom: 20,
            }}
            showsVerticalScrollIndicator={false}
            enableOnAndroid={true}
          >
            <View style={[styles.stepContentContainer, { marginRight: 0 }]}>
              <Text style={styles.stepTitle}>
                {i18n.t('whatTypePublisherAreYou')}
              </Text>
              <PublisherTypeSelector />
              <FeatureShowcase />
            </View>
          </KeyboardAwareScrollView>
          <ActionButton onPress={goNext}>{i18n.t('continue')}</ActionButton>
        </Wrapper>
      </View>
    </View>
  )
}

export default StepTwo
