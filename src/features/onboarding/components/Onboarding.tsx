import {
  ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { View } from 'react-native'
import StepOne from '@/features/onboarding/components/steps/One'
import StepTwo from '@/features/onboarding/components/steps/Two'
import StepThree from '@/features/onboarding/components/steps/Three'
import StepDefaultNav from '@/features/onboarding/components/steps/DefaultNav'
import PrivacyFirst from '@/features/onboarding/components/steps/PrivacyFirst'
import ProfileSetup from '@/features/onboarding/components/steps/ProfileSetup'
import ProfileSetupPioneerDate from '@/features/onboarding/components/steps/ProfileSetupPioneerDate'
import Supporter from '@/features/onboarding/components/steps/Supporter'
import ICloudRestore from '@/features/onboarding/components/steps/iCloudRestore'
import MytimeImport from '@/features/onboarding/components/steps/MytimeImport'
import FounderNote from '@/features/onboarding/components/steps/FounderNote'
import IntentPicker from '@/features/onboarding/components/steps/IntentPicker'
import YourPlanPreview from '@/features/onboarding/components/steps/YourPlanPreview'
import OnboardingBackfill from '@/features/onboarding/components/steps/OnboardingBackfill'
import { hasReportsInCatchUpWindow } from '@/features/service-reports/components/OnboardingBackfillForm'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import { TimeEntriesByYear } from '@/types/timeEntry'
import {
  effectiveHasAnnualGoal,
  tracksTenure,
} from '@/lib/publisherCapabilities'
import { Publisher } from '@/types/publisher'
import moment from 'moment'
import {
  OnboardingProgress,
  OnboardingProgressContext,
} from '@/features/onboarding/components/OnboardingProgressContext'

type StepId =
  | 'hero'
  | 'founderNote'
  | 'privacyFirst'
  | 'iCloudRestore'
  | 'mytimeImport'
  | 'publisherType'
  | 'intentPicker'
  | 'profileSetup'
  | 'pioneerDate'
  | 'yourPlanPreview'
  | 'notifications'
  | 'defaultNav'
  | 'onboardingBackfill'
  | 'supporter'

interface StepProps {
  goBack: () => void
  goNext: () => void
}

/**
 * Context passed to `showIf`. Widened beyond `publisher` so steps can gate on
 * other onboarding state (e.g. the backfill step needs `installedOn` and the
 * user's annual-goal override).
 */
interface StepShowIfContext {
  publisher: Publisher
  installedOn: Date
  userSpecifiedHasAnnualGoal: boolean | 'default'
  serviceReports: TimeEntriesByYear
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
  showIf?: (ctx: StepShowIfContext) => boolean
}

const allSteps: StepDef[] = [
  { id: 'hero', Component: StepOne, countsTowardProgress: false },
  { id: 'founderNote', Component: FounderNote, countsTowardProgress: false },
  { id: 'privacyFirst', Component: PrivacyFirst, countsTowardProgress: true },
  { id: 'iCloudRestore', Component: ICloudRestore, countsTowardProgress: true },
  { id: 'mytimeImport', Component: MytimeImport, countsTowardProgress: true },
  { id: 'publisherType', Component: StepTwo, countsTowardProgress: true },
  { id: 'intentPicker', Component: IntentPicker, countsTowardProgress: true },
  { id: 'profileSetup', Component: ProfileSetup, countsTowardProgress: true },
  {
    id: 'pioneerDate',
    Component: ProfileSetupPioneerDate,
    countsTowardProgress: true,
    showIf: ({ publisher }) => tracksTenure(publisher),
  },
  {
    id: 'yourPlanPreview',
    Component: YourPlanPreview,
    countsTowardProgress: true,
  },
  { id: 'notifications', Component: StepThree, countsTowardProgress: true },
  { id: 'defaultNav', Component: StepDefaultNav, countsTowardProgress: true },
  {
    id: 'onboardingBackfill',
    Component: OnboardingBackfill,
    countsTowardProgress: true,
    // Only annual-goal publishers who installed mid-service-year (any month
    // other than September) need to backdate. September installs have no
    // missed months, and monthly-goal publishers don't track an annual total.
    // Also skip when a restore already populated the catch-up window — the
    // user has nothing left to backdate.
    showIf: ({
      publisher,
      installedOn,
      userSpecifiedHasAnnualGoal,
      serviceReports,
    }) =>
      effectiveHasAnnualGoal(publisher, userSpecifiedHasAnnualGoal) &&
      moment(installedOn).month() !== 8 &&
      !hasReportsInCatchUpWindow(serviceReports, installedOn),
  },
  { id: 'supporter', Component: Supporter, countsTowardProgress: true },
]

const OnBoarding = () => {
  const {
    set,
    role,
    onboardingStepId,
    installedOn,
    userSpecifiedHasAnnualGoal,
  } = usePreferences()
  const { serviceReports } = useServiceReport()

  const showIfCtx: StepShowIfContext = useMemo(
    () => ({
      publisher: role,
      installedOn,
      userSpecifiedHasAnnualGoal,
      serviceReports,
    }),
    [role, installedOn, userSpecifiedHasAnnualGoal, serviceReports]
  )

  const visibleSteps = useMemo(
    () => allSteps.filter((s) => !s.showIf || s.showIf(showIfCtx)),
    [showIfCtx]
  )

  // Lazy-init from persisted step id so a mid-flow reload resumes where the
  // user left off. OnBoarding is only mounted while `onboardingComplete` is
  // false (see RootStack), and unmounts on completion/reset, so this runs
  // exactly once per onboarding session.
  const [stepIndex, setStepIndex] = useState(() => {
    if (!onboardingStepId) return 0
    const initialVisible = allSteps.filter(
      (s) => !s.showIf || s.showIf(showIfCtx)
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
    if (stepIndex >= visibleSteps.length - 1) {
      set({ onboardingComplete: true, onboardingStepId: null })
      return
    }
    setStepIndex(stepIndex + 1)
  }, [stepIndex, visibleSteps.length, set])

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
