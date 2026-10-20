import { useIsFocused } from '@react-navigation/native'
import {
  ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { View } from 'react-native'
import { calendarBridgeAvailable } from '../../../../modules/calendar-bridge'
import StepOne from '@/features/onboarding/components/steps/One'
import StepTwo from '@/features/onboarding/components/steps/Two'
import StepThree from '@/features/onboarding/components/steps/Three'
import CalendarSync from '@/features/onboarding/components/steps/CalendarSync'
import DataProtection from '@/features/onboarding/components/steps/DataProtection'
import ProfileSetup from '@/features/onboarding/components/steps/ProfileSetup'
import ProfileSetupPioneerDate from '@/features/onboarding/components/steps/ProfileSetupPioneerDate'
import PickUpWhereLeftOff from '@/features/onboarding/components/steps/PickUpWhereLeftOff'
import FounderNote from '@/features/onboarding/components/steps/FounderNote'
import FeatureTour from '@/features/onboarding/components/steps/FeatureTour'
import PlanMonth from '@/features/onboarding/components/steps/PlanMonth'
import useRestoreSourceFound from '@/features/onboarding/hooks/useRestoreSourceFound'
import OnboardingBackfill from '@/features/onboarding/components/steps/OnboardingBackfill'
import { hasReportsInCatchUpWindow } from '@/features/service-reports/components/OnboardingBackfillForm'
import { usePreferences } from '@/stores/preferences'
import { FRESH_SETUP_PREFERENCES } from '@/lib/syncPreferencePolicy'
import useServiceReport from '@/stores/serviceReport'
import {
  effectiveHasAnnualGoal,
  tracksTenure,
} from '@/lib/publisherCapabilities'
import {
  passesRestoreStep,
  resumedRestoreOffer,
  resumeStepIndex,
  type StepId,
  type StepShowIfContext,
  visibleOnboardingSteps,
} from '@/features/onboarding/lib/onboardingSteps'
import {
  OnboardingProgress,
  OnboardingProgressContext,
} from '@/features/onboarding/components/OnboardingProgressContext'
import { useOnboardingHandoff } from '@/stores/onboardingHandoff'
import { useProfile } from '@/stores/profile'
import { analytics } from '@/lib/analytics'

interface StepProps {
  goBack: () => void
  goNext: () => void
}

const STEP_COMPONENTS: Record<StepId, ComponentType<StepProps>> = {
  hero: StepOne,
  featureTour: FeatureTour,
  pickUpWhereLeftOff: PickUpWhereLeftOff,
  publisherType: StepTwo,
  pioneerDate: ProfileSetupPioneerDate,
  planMonth: PlanMonth,
  dataProtection: DataProtection,
  notifications: StepThree,
  calendarSync: CalendarSync,
  onboardingBackfill: OnboardingBackfill,
  profileSetup: ProfileSetup,
  founderNote: FounderNote,
}

const OnBoarding = () => {
  const {
    set,
    role,
    publisherHours,
    logsHours,
    onboardingStepId,
    installedOn,
    userSpecifiedHasAnnualGoal,
  } = usePreferences()
  const { serviceReports } = useServiceReport()
  const hasCompletedProfileSetup = useProfile((s) => s.hasCompletedProfileSetup)
  // "Pick up where you left off" shows when this device already sees a
  // restore source, or the user says they already use WitnessWork. The answer
  // settles once they move past the tour (null until then), so one that comes
  // in late never adds or removes a step behind them.
  const restoreFound = useRestoreSourceFound()
  const [restoreSettled, setRestoreSettled] = useState(() =>
    resumedRestoreOffer(onboardingStepId, hasCompletedProfileSetup)
  )
  const restoreOffered = restoreSettled ?? restoreFound

  const showIfCtx: StepShowIfContext = useMemo(
    () => ({
      publisher: role,
      publisherHours,
      logsHours,
      installedOn,
      userSpecifiedHasAnnualGoal,
      hasCatchUpReports: hasReportsInCatchUpWindow(serviceReports, installedOn),
      restoreOffered,
      calendarAvailable: calendarBridgeAvailable,
    }),
    [
      role,
      publisherHours,
      logsHours,
      installedOn,
      userSpecifiedHasAnnualGoal,
      serviceReports,
      restoreOffered,
    ]
  )

  const visibleSteps = useMemo(
    () => visibleOnboardingSteps(showIfCtx),
    [showIfCtx]
  )

  // Lazy-init from persisted step id so a mid-flow reload resumes where the
  // user left off. OnBoarding is only mounted while `onboardingComplete` is
  // false (see RootStack), and unmounts on completion/reset, so this runs
  // exactly once per onboarding session.
  const [stepIndex, setStepIndex] = useState(() =>
    resumeStepIndex(
      onboardingStepId,
      visibleOnboardingSteps(showIfCtx),
      hasCompletedProfileSetup
    )
  )

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

  const isFocused = useIsFocused()
  const stepViewedAt = useRef(Date.now())
  const lastViewedStep = useRef<StepId | null>(null)
  const initialStepId = useRef(onboardingStepId)
  useEffect(() => {
    const step = visibleSteps[stepIndex]
    if (!isFocused || !step || lastViewedStep.current === step.id) return
    if (lastViewedStep.current === null) {
      analytics.capture(
        initialStepId.current ? 'onboarding_resumed' : 'onboarding_started',
        {
          step_id: step.id,
        }
      )
    }
    lastViewedStep.current = step.id
    stepViewedAt.current = Date.now()
    analytics.capture('onboarding_step_viewed', {
      step_id: step.id,
      step_index: stepIndex + 1,
      total_steps: visibleSteps.length,
      publisher_role: role,
      has_annual_goal: effectiveHasAnnualGoal(role, userSpecifiedHasAnnualGoal),
      tenure_step_available: tracksTenure(role),
      backfill_step_available: visibleSteps.some(
        (candidate) => candidate.id === 'onboardingBackfill'
      ),
      restore_step_available: visibleSteps.some(
        (candidate) => candidate.id === 'pickUpWhereLeftOff'
      ),
    })
  }, [stepIndex, visibleSteps, isFocused, role, userSpecifiedHasAnnualGoal])

  const goNext = useCallback(() => {
    const preferences = usePreferences.getState()
    analytics.capture('onboarding_step_completed', {
      step_id: visibleSteps[stepIndex]?.id,
      elapsed_ms: Date.now() - stepViewedAt.current,
      next_step_id: visibleSteps[stepIndex + 1]?.id ?? 'complete',
      publisher_role: preferences.role,
    })
    if (stepIndex >= visibleSteps.length - 1) {
      set({ onboardingComplete: true, onboardingStepId: null })
      analytics.capture('onboarding_completed', { completion_method: 'guided' })
      return
    }
    // Leaving the tour settles the restore step. Passing it by starts fresh,
    // as its "Start fresh" does.
    if (
      restoreSettled === null &&
      passesRestoreStep(visibleSteps[stepIndex + 1]?.id)
    ) {
      setRestoreSettled(restoreOffered)
      if (!restoreOffered) set(FRESH_SETUP_PREFERENCES)
    }
    setStepIndex(stepIndex + 1)
  }, [stepIndex, visibleSteps, set, restoreSettled, restoreOffered])

  const goBack = useCallback(() => {
    setStepIndex((idx) => (idx === 0 ? 0 : idx - 1))
  }, [])

  // The welcome's "I already use WitnessWork" opens the restore step for
  // anyone this device couldn't tell.
  const goToRestore = useCallback(() => {
    setRestoreSettled(true)
    const target = visibleOnboardingSteps({
      ...showIfCtx,
      restoreOffered: true,
    }).findIndex((s) => s.id === 'pickUpWhereLeftOff')
    if (target >= 0) setStepIndex(target)
  }, [showIfCtx])

  // A screen pushed over onboarding (the Notes Import composer, opened from the
  // "From Notes" step) can ask us to advance — e.g. the user chose to keep
  // setting up while a slow import finishes. zustand's set is synchronous, so
  // consuming here can't double-fire across the re-render goNext triggers.
  const continueRequested = useOnboardingHandoff((s) => s.continueRequested)
  const consumeContinue = useOnboardingHandoff((s) => s.consumeContinue)
  useEffect(() => {
    if (!continueRequested) return
    consumeContinue()
    goNext()
  }, [continueRequested, consumeContinue, goNext])

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
  const StepComponent = STEP_COMPONENTS[current.id]

  return (
    <OnboardingProgressContext.Provider value={progress}>
      <View style={{ flexGrow: 1 }}>
        {current.id === 'hero' ? (
          <StepOne goBack={goBack} goNext={goNext} goToRestore={goToRestore} />
        ) : (
          <StepComponent goBack={goBack} goNext={goNext} />
        )}
      </View>
    </OnboardingProgressContext.Provider>
  )
}

export default OnBoarding
