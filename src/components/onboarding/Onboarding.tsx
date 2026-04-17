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
import ICloudRestore from './steps/iCloudRestore'

const steps = [
  StepOne,
  PrivacyFirst,
  // iCloud restore lives on iOS only; step is skipped on Android (see goNext).
  ICloudRestore,
  StepTwo,
  ProfileSetup,
  StepThree,
  StepDefaultNav,
  Supporter,
  StepFour,
]
const DEFAULT_NAV_STEP_INDEX = steps.indexOf(StepDefaultNav)
const ICLOUD_RESTORE_STEP_INDEX = steps.indexOf(ICloudRestore)

const OnBoarding = () => {
  const { set, onboardingComplete } = usePreferences()
  const [onboardingStep, setOnboardingStep] = useState(0)

  useEffect(() => {
    if (onboardingComplete === false) {
      setOnboardingStep(0)
    }
  }, [onboardingComplete])

  const goNext = () => {
    // Skip iOS-only steps on Android (iCloud restore + default nav). If the
    // next step is an iOS-only step and we're on Android, hop over it.
    if (Platform.OS === 'android') {
      if (onboardingStep === ICLOUD_RESTORE_STEP_INDEX - 1) {
        setOnboardingStep(onboardingStep + 2)
        return
      }
      if (onboardingStep === DEFAULT_NAV_STEP_INDEX - 1) {
        setOnboardingStep(onboardingStep + 2)
        return
      }
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
    // Mirror the skip logic going backward on Android.
    if (Platform.OS === 'android') {
      if (onboardingStep === ICLOUD_RESTORE_STEP_INDEX + 1) {
        setOnboardingStep(onboardingStep - 2)
        return
      }
      if (onboardingStep === DEFAULT_NAV_STEP_INDEX + 1) {
        setOnboardingStep(onboardingStep - 2)
        return
      }
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
