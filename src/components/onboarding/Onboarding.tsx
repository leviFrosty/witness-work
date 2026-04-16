import { useEffect, useState } from 'react'
import { Platform, View } from 'react-native'
import StepOne from './steps/One'
import StepTwo from './steps/Two'
import StepThree from './steps/Three'
import StepFour from './steps/Four'
import { usePreferences } from '../../stores/preferences'
import StepDefaultNav from './steps/DefaultNav'
import PrivacyFirst from './steps/PrivacyFirst'
import ProfileSetup from './steps/ProfileSetup'
import Supporter from './steps/Supporter'

const steps = [
  StepOne,
  PrivacyFirst,
  StepTwo,
  ProfileSetup,
  StepThree,
  StepDefaultNav,
  Supporter,
  StepFour,
]
const DEFAULT_NAV_STEP_INDEX = steps.indexOf(StepDefaultNav)

const OnBoarding = () => {
  const { set, onboardingComplete } = usePreferences()
  const [onboardingStep, setOnboardingStep] = useState(0)

  useEffect(() => {
    if (onboardingComplete === false) {
      setOnboardingStep(0)
    }
  }, [onboardingComplete])

  const goNext = () => {
    // Skips default navigation step on Android. Android does not have configuration default navigation.
    if (
      Platform.OS === 'android' &&
      onboardingStep === DEFAULT_NAV_STEP_INDEX - 1
    ) {
      setOnboardingStep(onboardingStep + 2)
      return
    }

    if (onboardingStep === steps.length - 1) {
      set({ onboardingComplete: true })
      return
    }

    setOnboardingStep(onboardingStep + 1)
  }

  const goBack = () => {
    if (onboardingStep === 0) {
      return
    }
    // Skips default navigation step on Android going backward as well.
    if (
      Platform.OS === 'android' &&
      onboardingStep === DEFAULT_NAV_STEP_INDEX + 1
    ) {
      setOnboardingStep(onboardingStep - 2)
      return
    }
    setOnboardingStep(onboardingStep - 1)
  }

  const renderStep = () => {
    const SelectedStep = steps[onboardingStep]
    return <SelectedStep goBack={goBack} goNext={goNext} />
  }

  return (
    <View
      style={{
        flexGrow: 1,
      }}
    >
      {renderStep()}
    </View>
  )
}

export default OnBoarding
