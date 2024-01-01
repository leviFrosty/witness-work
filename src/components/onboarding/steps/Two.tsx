import { View, TouchableWithoutFeedback, Keyboard } from 'react-native'
import { styles } from '../Onboarding.styles'
import OnboardingNav from '../OnboardingNav'
import Text from '../../MyText'
import i18n from '../../../lib/locales'
import PublisherTypeSelector from '../../PublisherTypeSelector'
import Wrapper from '../../layout/Wrapper'
import ActionButton from '../../ActionButton'

interface Props {
  goBack: () => void
  goNext: () => void
}

const StepTwo = ({ goBack, goNext }: Props) => {
  const handlePress = () => {
    Keyboard.dismiss()
  }
  return (
    <View style={{ flex: 1 }}>
      <TouchableWithoutFeedback onPress={handlePress}>
        <View style={{ flex: 1 }}>
          <Wrapper
            style={{
              flexGrow: 1,
              paddingHorizontal: 30,
              paddingTop: 60,
              paddingBottom: 100,
              justifyContent: 'space-between',
            }}
          >
            <OnboardingNav goBack={goBack} />
            <View style={styles.stepContentContainer}>
              <Text style={styles.stepTitle}>
                {i18n.t('whatTypePublisherAreYou')}
              </Text>
              <PublisherTypeSelector />
            </View>
            <ActionButton onPress={goNext}>{i18n.t('continue')}</ActionButton>
          </Wrapper>
        </View>
      </TouchableWithoutFeedback>
    </View>
  )
}

export default StepTwo
