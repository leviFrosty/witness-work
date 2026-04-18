import { useEffect, useState } from 'react'
import { View } from 'react-native'
import StepOne from './steps/One'
import StepTwo from './steps/Two'
import StepThree from './steps/Three'
import StepFour from './steps/Four'
import { usePreferences } from '../../stores/preferences'
import StepDefaultNav from './steps/DefaultNav'
import PrivacyFirst from './steps/PrivacyFirst'
import ProfileSetup from './steps/ProfileSetup'
import Supporter from './steps/Supporter'
import ICloudRestore from './steps/iCloudRestore'

const steps = [
  StepOne,
  PrivacyFirst,
  ICloudRestore,
  StepTwo,
  ProfileSetup,
  StepThree,
  StepDefaultNav,
  Supporter,
  StepFour,
]

const OnBoarding = () => {
  const { set, onboardingComplete } = usePreferences()
  const [onboardingStep, setOnboardingStep] = useState(0)

  useEffect(() => {
    if (onboardingComplete === false) {
      setOnboardingStep(0)
    }
  }, [onboardingComplete])

  const goNext = () => {
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
