import { View } from 'react-native'
import { styles } from '../Onboarding.styles'
import Text from '../../MyText'
import i18n from '../../../lib/locales'
import Wrapper from '../../layout/Wrapper'
import ActionButton from '../../ActionButton'
import Button from '../../Button'
import useTheme from '../../../contexts/theme'

interface Props {
  goNext: () => void
  goBack?: () => void
  /**
   * Optional jump-to-step hook that the onboarding integrator can wire up in
   * Phase 1b. When present it's used to hop straight to the iCloud restore
   * step, which is the cleanest path. When absent, we fall back to calling
   * `goNext()` twice to skip over PrivacyFirst; note that today's
   * `Onboarding.tsx` uses stale-closure state, so for the fallback to land on
   * iCloudRestore the integrator must either switch `goNext` to a functional
   * updater or supply `goToStep`. Accepting the prop keeps this component
   * forward-compatible without coupling it to the step list.
   *
   * Choice: accept `goToStep` AND provide a double-`goNext` fallback. It
   * matches the task spec and lets Phase 1b pick whichever plumbing is cleanest
   * in `Onboarding.tsx` without revisiting this file.
   */
  goToStep?: (stepId: 'iCloudRestore') => void
}

const StepOne = ({ goNext, goToStep }: Props) => {
  const theme = useTheme()

  const handleReturningUser = () => {
    if (goToStep) {
      goToStep('iCloudRestore')
      return
    }
    // Fallback: advance twice, skipping PrivacyFirst to land on iCloudRestore.
    goNext()
    goNext()
  }

  return (
    <Wrapper
      style={{
        flexGrow: 1,
        paddingHorizontal: 30,
        paddingTop: 60,
        paddingBottom: 100,
      }}
    >
      <View style={styles.onboardingTitleWrapper}>
        <View style={styles.textContainer}>
          <Text style={styles.title}>{i18n.t('onboardingHeroTagline')}</Text>
        </View>
      </View>
      <ActionButton onPress={goNext}>{i18n.t('getStarted')}</ActionButton>
      <View style={{ alignItems: 'center', marginTop: 16 }}>
        <Button onPress={handleReturningUser}>
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.textAlt,
              textDecorationLine: 'underline',
            }}
          >
            {i18n.t('onboardingHeroReturningLink')}
          </Text>
        </Button>
      </View>
    </Wrapper>
  )
}

export default StepOne
