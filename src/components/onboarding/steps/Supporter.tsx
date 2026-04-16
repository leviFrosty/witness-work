import { View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { styles } from '../Onboarding.styles'
import OnboardingNav from '../OnboardingNav'
import Text from '../../MyText'
import i18n from '../../../lib/locales'
import Wrapper from '../../layout/Wrapper'
import ActionButton from '../../ActionButton'
import SupporterBadge from '../../SupporterBadge'
import SupporterBenefits from '../../SupporterBenefits'
import useTheme from '../../../contexts/theme'

interface Props {
  goBack: () => void
  goNext: () => void
}

const Supporter = ({ goBack, goNext }: Props) => {
  const theme = useTheme()

  return (
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
      >
        <View style={[styles.stepContentContainer, { marginRight: 0 }]}>
          <SupporterBadge
            size='md'
            style={{ alignSelf: 'flex-start', marginBottom: 24 }}
          />
          <Text style={[styles.stepTitle, { marginTop: 14 }]}>
            {i18n.t('supporterOnboardingTitle')}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              marginBottom: 24,
              lineHeight: 20,
            }}
          >
            {i18n.t('supporterOnboardingDesc')}
          </Text>
          <SupporterBenefits />
        </View>
      </KeyboardAwareScrollView>
      <ActionButton onPress={goNext}>{i18n.t('continue')}</ActionButton>
    </Wrapper>
  )
}

export default Supporter
