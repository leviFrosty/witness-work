import { View } from 'react-native'

import OnboardingNav from '../OnboardingNav'
import Wrapper from '../../../../components/layout/Wrapper'
import ServiceYearCatchUpForm from '../../../../components/ServiceYearCatchUpForm'

interface Props {
  goBack: () => void
  goNext: () => void
}

const ServiceYearCatchUp = ({ goBack, goNext }: Props) => {
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
        <ServiceYearCatchUpForm onComplete={goNext} onSkip={goNext} />
      </View>
    </Wrapper>
  )
}

export default ServiceYearCatchUp
