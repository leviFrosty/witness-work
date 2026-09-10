import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import MileageOnboardingSetup from '@/features/mileage/components/MileageOnboardingSetup'

const MileageSetup = ({
  goBack,
  goNext,
}: {
  goBack: () => void
  goNext: () => void
}) => (
  <Wrapper
    style={{
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 40,
    }}
  >
    <OnboardingNav goBack={goBack} />
    <KeyboardAwareScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: 30, paddingBottom: 30 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps='handled'
    >
      <MileageOnboardingSetup onContinue={goNext} />
    </KeyboardAwareScrollView>
  </Wrapper>
)
export default MileageSetup
