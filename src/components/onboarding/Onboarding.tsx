import {
  ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { View } from 'react-native'
import StepOne from './steps/One'
import StepTwo from './steps/Two'
import StepThree from './steps/Three'
import StepDefaultNav from './steps/DefaultNav'
import PrivacyFirst from './steps/PrivacyFirst'
import ProfileSetup from './steps/ProfileSetup'
import ProfileSetupPioneerDate from './steps/ProfileSetupPioneerDate'
import Supporter from './steps/Supporter'
import ICloudRestore from './steps/iCloudRestore'
import FounderNote from './steps/FounderNote'
import IntentPicker from './steps/IntentPicker'
import YourPlanPreview from './steps/YourPlanPreview'
import { usePreferences } from '../../stores/preferences'
import { tracksStartDate } from '../../constants/publisher'
import { Publisher } from '../../types/publisher'
import {
  OnboardingProgress,
  OnboardingProgressContext,
} from './OnboardingProgressContext'

type StepId =
  | 'hero'
  | 'founderNote'
  | 'privacyFirst'
  | 'iCloudRestore'
  | 'publisherType'
  | 'intentPicker'
  | 'profileSetup'
  | 'pioneerDate'
  | 'yourPlanPreview'
  | 'notifications'
  | 'defaultNav'
  | 'supporter'

interface StepProps {
  goBack: () => void
  goNext: () => void
}

interface StepDef {
  id: StepId
  Component: ComponentType<StepProps>
  /**
   * Whether this step contributes to the visible progress bar. Hero + founder
   * screens opt out so the user sees a shorter "2 of 10" rather than "3 of
   * 12".
   */
  countsTowardProgress: boolean
  /** If present and returns false, the step is skipped entirely. */
  showIf?: (publisher: Publisher) => boolean
}

const allSteps: StepDef[] = [
  { id: 'hero', Component: StepOne, countsTowardProgress: false },
  { id: 'founderNote', Component: FounderNote, countsTowardProgress: false },
  { id: 'privacyFirst', Component: PrivacyFirst, countsTowardProgress: true },
  { id: 'iCloudRestore', Component: ICloudRestore, countsTowardProgress: true },
  { id: 'publisherType', Component: StepTwo, countsTowardProgress: true },
  { id: 'intentPicker', Component: IntentPicker, countsTowardProgress: true },
  { id: 'profileSetup', Component: ProfileSetup, countsTowardProgress: true },
  {
    id: 'pioneerDate',
    Component: ProfileSetupPioneerDate,
    countsTowardProgress: true,
    showIf: (publisher) => tracksStartDate(publisher),
  },
  {
    id: 'yourPlanPreview',
    Component: YourPlanPreview,
    countsTowardProgress: true,
  },
  { id: 'notifications', Component: StepThree, countsTowardProgress: true },
  { id: 'defaultNav', Component: StepDefaultNav, countsTowardProgress: true },
  { id: 'supporter', Component: Supporter, countsTowardProgress: true },
]

const OnBoarding = () => {
  const { set, publisher, onboardingStepId } = usePreferences()

  const visibleSteps = useMemo(
    () => allSteps.filter((s) => !s.showIf || s.showIf(publisher)),
    [publisher]
  )

  // Lazy-init from persisted step id so a mid-flow reload resumes where the
  // user left off. OnBoarding is only mounted while `onboardingComplete` is
  // false (see RootStack), and unmounts on completion/reset, so this runs
  // exactly once per onboarding session.
  const [stepIndex, setStepIndex] = useState(() => {
    if (!onboardingStepId) return 0
    const initialVisible = allSteps.filter(
      (s) => !s.showIf || s.showIf(publisher)
    )
    const idx = initialVisible.findIndex((s) => s.id === onboardingStepId)
    return idx >= 0 ? idx : 0
  })

  // Clamp the index if the visible-step list shrinks (e.g. user switches
  // publisher type from pioneer to non-pioneer mid-flow and the pioneer-date
  // screen disappears beneath the current index).
  useEffect(() => {
    setStepIndex((idx) => Math.min(idx, Math.max(0, visibleSteps.length - 1)))
  }, [visibleSteps.length])

  // Persist the active step id so reloads resume here. Writing the id (not
  // the index) keeps the saved state meaningful even when conditional steps
  // re-order the visible list. Skipped on first mount: when there's no
  // persisted id, the useState initializer above already lands on step 0, and
  // writing 'hero' back during the same commit cycle that flipped
  // onboardingComplete=false races App's preferences subscription and trips
  // React's "update during render" warning.
  const skipFirstPersist = useRef(true)
  useEffect(() => {
    if (skipFirstPersist.current) {
      skipFirstPersist.current = false
      return
    }
    const id = visibleSteps[stepIndex]?.id
    if (id && id !== onboardingStepId) {
      set({ onboardingStepId: id })
    }
  }, [stepIndex, visibleSteps, onboardingStepId, set])

  const goNext = useCallback(() => {
    setStepIndex((idx) => {
      if (idx >= visibleSteps.length - 1) {
        set({ onboardingComplete: true, onboardingStepId: null })
        return idx
      }
      return idx + 1
    })
  }, [visibleSteps.length, set])

  const goBack = useCallback(() => {
    setStepIndex((idx) => (idx === 0 ? 0 : idx - 1))
  }, [])

  const goToStep = useCallback(
    (id: StepId) => {
      const target = visibleSteps.findIndex((s) => s.id === id)
      if (target >= 0) setStepIndex(target)
    },
    [visibleSteps]
  )

  const current = visibleSteps[stepIndex]

  const progress = useMemo<OnboardingProgress>(() => {
    if (!current?.countsTowardProgress) return {}
    const totalSteps = visibleSteps.filter((s) => s.countsTowardProgress).length
    const currentStep = visibleSteps
      .slice(0, stepIndex + 1)
      .filter((s) => s.countsTowardProgress).length
    return { currentStep, totalSteps }
  }, [visibleSteps, stepIndex, current])

  if (!current) return null

  return (
    <OnboardingProgressContext.Provider value={progress}>
      <View style={{ flexGrow: 1 }}>
        {current.id === 'hero' ? (
          <StepOne goBack={goBack} goNext={goNext} goToStep={goToStep} />
        ) : (
          <current.Component goBack={goBack} goNext={goNext} />
        )}
      </View>
    </OnboardingProgressContext.Provider>
  )
}

export default OnBoarding
