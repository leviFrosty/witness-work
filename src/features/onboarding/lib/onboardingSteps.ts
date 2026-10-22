import moment from 'moment'
import {
  effectiveHasAnnualGoal,
  getEntryMode,
  tracksHours,
  tracksTenure,
} from '@/lib/publisherCapabilities'
import type { Publisher, PublisherHours } from '@/types/publisher'

export type StepId =
  | 'hero'
  | 'featureTour'
  | 'pickUpWhereLeftOff'
  | 'publisherType'
  | 'hoursLogging'
  | 'pioneerDate'
  | 'planMonth'
  | 'dataProtection'
  | 'buddies'
  | 'notifications'
  | 'calendarSync'
  | 'defaultNav'
  | 'onboardingBackfill'
  | 'profileSetup'
  | 'founderNote'

/**
 * Context passed to `showIf`. Widened beyond `publisher` so steps can gate on
 * other onboarding state (e.g. the backfill step needs `installedOn` and the
 * user's annual-goal override).
 */
export interface StepShowIfContext {
  publisher: Publisher
  publisherHours: PublisherHours
  logsHours: boolean
  installedOn: Date
  userSpecifiedHasAnnualGoal: boolean | 'default'
  /** A restore already put reports in the backfill step's catch-up window. */
  hasCatchUpReports: boolean
  /** Buddies shows on this device; see `useOnboardingBuddiesAvailable`. */
  buddiesAvailable: boolean
  /** The binary has the native calendar module. */
  calendarAvailable: boolean
}

export interface StepDef {
  id: StepId
  /**
   * Whether this step contributes to the visible progress bar. The introduction
   * (welcome, tour, restore) and the closing founder note opt out, so the bar
   * covers personalizing only.
   */
  countsTowardProgress: boolean
  /** If present and returns false, the step is skipped entirely. */
  showIf?: (ctx: StepShowIfContext) => boolean
}

/**
 * Introduce first, then personalize: the welcome and a tour of the app come
 * before any question, the name, the most personal ask, comes last, and a note
 * from the developer sees them into the app.
 */
export const onboardingSteps: StepDef[] = [
  { id: 'hero', countsTowardProgress: false },
  { id: 'featureTour', countsTowardProgress: false },
  { id: 'pickUpWhereLeftOff', countsTowardProgress: false },
  { id: 'publisherType', countsTowardProgress: true },
  {
    id: 'hoursLogging',
    countsTowardProgress: true,
    // The Kingdom Publisher reports only whether they shared, so the hours
    // surfaces stay hidden unless they say they want them (Hours Logging).
    showIf: ({ publisher }) => getEntryMode(publisher) === 'checkbox',
  },
  {
    id: 'pioneerDate',
    countsTowardProgress: true,
    showIf: ({ publisher }) => tracksTenure(publisher),
  },
  {
    id: 'planMonth',
    countsTowardProgress: true,
    // Planning toward a goal needs hours and a goal to plan toward.
    showIf: ({ publisher, publisherHours, logsHours }) =>
      tracksHours(publisher, logsHours) && publisherHours[publisher] > 0,
  },
  { id: 'dataProtection', countsTowardProgress: true },
  {
    id: 'buddies',
    countsTowardProgress: true,
    // Needs the Buddies key module and the rollout flag (iOS and Android).
    showIf: ({ buddiesAvailable }) => buddiesAvailable,
  },
  { id: 'notifications', countsTowardProgress: true },
  {
    id: 'calendarSync',
    countsTowardProgress: true,
    showIf: ({ calendarAvailable }) => calendarAvailable,
  },
  { id: 'defaultNav', countsTowardProgress: true },
  {
    id: 'onboardingBackfill',
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
      hasCatchUpReports,
    }) =>
      effectiveHasAnnualGoal(publisher, userSpecifiedHasAnnualGoal) &&
      moment(installedOn).month() !== 8 &&
      !hasCatchUpReports,
  },
  { id: 'profileSetup', countsTowardProgress: true },
  // A thank-you from the developer, the last thing before the app opens.
  { id: 'founderNote', countsTowardProgress: false },
]

export const visibleOnboardingSteps = (ctx: StepShowIfContext) =>
  onboardingSteps.filter((s) => !s.showIf || s.showIf(ctx))

/**
 * The step a saved id stands for now. Retired ids map to the step that now sits
 * where each one was.
 */
const resumeStepId = (
  savedId: string,
  hasPlanMonth: boolean,
  hasCompletedProfileSetup: boolean
) => {
  // 'supporter' was the final step before it was removed.
  if (savedId === 'supporter') return 'founderNote'
  // The intent picker and plan preview were removed; resume on the step
  // that now sits where each one was.
  // The privacy and badges screens moved into the tour; resume on the step
  // that followed each one. The founder note moved from the start to the
  // end: one saved before the name step was the old, early one.
  // The report-method question was removed (it's set in Settings, and sits
  // above Submit on the report screen); resume on what followed it.
  if (
    savedId === 'privacyFirst' ||
    (savedId === 'founderNote' && !hasCompletedProfileSetup)
  ) {
    return 'pickUpWhereLeftOff'
  }
  if (savedId === 'intentPicker') return 'pioneerDate'
  if (savedId === 'yourPlanPreview') {
    return hasPlanMonth ? 'planMonth' : 'notifications'
  }
  if (savedId === 'badges') return 'notifications'
  if (savedId === 'defaultExportMethod') return 'onboardingBackfill'
  return savedId
}

/**
 * `current` (a persisted step id, possibly a retired one) is at or past `id`'s
 * place in the flow.
 */
export const reachedStep = (
  current: string | null,
  id: StepId,
  hasCompletedProfileSetup: boolean
) => {
  if (!current) return false
  // Visibility isn't known yet here, so a retired plan preview counts as
  // the earlier of its two places.
  const resumeId = resumeStepId(current, true, hasCompletedProfileSetup)
  const index = onboardingSteps.findIndex((step) => step.id === resumeId)
  return (
    index >= 0 && index >= onboardingSteps.findIndex((step) => step.id === id)
  )
}

/** Where a relaunch resumes, given the step id saved before it. */
export const resumeStepIndex = (
  savedId: string | null,
  visibleSteps: StepDef[],
  hasCompletedProfileSetup: boolean
) => {
  if (!savedId) return 0
  // 'supporter' was the final step; resume on the new final step rather than
  // restarting from the hero.
  if (savedId === 'supporter') return visibleSteps.length - 1
  const resumeId = resumeStepId(
    savedId,
    visibleSteps.some((s) => s.id === 'planMonth'),
    hasCompletedProfileSetup
  )
  const idx = visibleSteps.findIndex((s) => s.id === resumeId)
  if (idx >= 0) return idx
  // A conditional step that no longer shows (e.g. Buddies after its flag
  // turned off): resume on the next step that does.
  const order = onboardingSteps.findIndex((s) => s.id === resumeId)
  const next =
    order >= 0
      ? visibleSteps.findIndex((s) => onboardingSteps.indexOf(s) > order)
      : -1
  return next >= 0 ? next : 0
}
