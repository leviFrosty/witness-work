import OnboardingNav from '../OnboardingNav'
import Text from '../../MyText'
import i18n from '../../../lib/locales'
import PublisherTypeSelector from '../../PublisherTypeSelector'
import Wrapper from '../../layout/Wrapper'
import ActionButton from '../../ActionButton'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import useTheme from '../../../contexts/theme'

interface Props {
  goBack: () => void
  goNext: () => void
}

const StepTwo = ({ goBack, goNext }: Props) => {
  const insets = useSafeAreaInsets()
  const theme = useTheme()

  return (
    <Wrapper
      style={{
        paddingTop: insets.top + 20,
        paddingBottom: insets.bottom + 20,
      }}
    >
      <OnboardingNav goBack={goBack} />
      <KeyboardAwareScrollView
        style={{
          backgroundColor: theme.colors.background,
          flex: 1,
        }}
        contentContainerStyle={{
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 100,
          paddingTop: 60,
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('2xl'),
            fontFamily: theme.fonts.bold,
            paddingBottom: 10,
          }}
        >
          {i18n.t('whatTypePublisherAreYou')}
        </Text>
        <PublisherTypeSelector />
      </KeyboardAwareScrollView>
      <ActionButton style={{ marginHorizontal: 20 }} onPress={goNext}>
        {i18n.t('continue')}
      </ActionButton>
    </Wrapper>
  )
}

export default StepTwo
