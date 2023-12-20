import { useEffect, useState } from 'react'
import { Platform, View } from 'react-native'
import StepOne from './steps/One'
import StepTwo from './steps/Two'
import StepThree from './steps/Three'
import StepFour from './steps/Four'
import { usePreferences } from '../../stores/preferences'
import StepDefaultNav from './steps/DefaultNav'

const steps = [StepOne, StepTwo, StepThree, StepDefaultNav, StepFour]

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
    if (Platform.OS === 'android' && onboardingStep === 2) {
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
