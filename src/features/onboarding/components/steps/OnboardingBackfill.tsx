import { View } from 'react-native'

import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import Wrapper from '@/components/ui/layout/Wrapper'
import OnboardingBackfillForm from '@/features/service-reports/components/OnboardingBackfillForm'

interface Props {
  goBack: () => void
  goNext: () => void
}

const OnboardingBackfill = ({ goBack, goNext }: Props) => {
  return (
    <Wrapper
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 60,
      }}
    >
      <OnboardingNav goBack={goBack} />
      <View style={{ flex: 1, paddingTop: 20 }}>
        <OnboardingBackfillForm onComplete={goNext} onSkip={goNext} />
      </View>
    </Wrapper>
  )
}

export default OnboardingBackfill
