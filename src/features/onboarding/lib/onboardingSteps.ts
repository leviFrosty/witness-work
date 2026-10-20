import moment from 'moment'
import {
  effectiveHasAnnualGoal,
  tracksHours,
  tracksTenure,
} from '@/lib/publisherCapabilities'
import type { Publisher, PublisherHours } from '@/types/publisher'

export type StepId =
  | 'hero'
  | 'featureTour'
  | 'pickUpWhereLeftOff'
  | 'publisherType'
  | 'pioneerDate'
  | 'planMonth'
  | 'dataProtection'
  | 'notifications'
  | 'calendarSync'
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
  /**
   * There's something to pick up: this device already sees a restore source
   * (see `detectRestoreSource`), or the user said they already use
   * WitnessWork.
   */
  restoreOffered: boolean
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
  {
    id: 'pickUpWhereLeftOff',
    countsTowardProgress: false,
    // Most people have nothing to bring over; the welcome's "I already use
    // WitnessWork" opens it for anyone the device couldn't tell.
    showIf: ({ restoreOffered }) => restoreOffered,
  },
  { id: 'publisherType', countsTowardProgress: true },
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
  { id: 'notifications', countsTowardProgress: true },
  {
    id: 'calendarSync',
    countsTowardProgress: true,
    showIf: ({ calendarAvailable }) => calendarAvailable,
  },
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
  // The maps and report-method questions were removed (both are set in
  // Settings, and the report method sits above Submit); resume on what
  // followed them. Buddies left setup for Schedule → Buddies, likewise.
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
  if (savedId === 'badges' || savedId === 'buddies') return 'notifications'
  if (savedId === 'defaultNav' || savedId === 'defaultExportMethod') {
    return 'onboardingBackfill'
  }
  return savedId
}

/** Where `id` sits in the full flow; -1 for an id that isn't in it. */
export const stepOrder = (id: string | null | undefined) =>
  onboardingSteps.findIndex((step) => step.id === id)

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
  const index = stepOrder(resumeStepId(current, true, hasCompletedProfileSetup))
  return index >= 0 && index >= stepOrder(id)
}

/**
 * Whether the restore step is settled in or out for an onboarding that resumes
 * on `savedId`, or null while it's still open (nothing saved yet, or still on
 * the welcome or tour). Resuming on the step keeps it; resuming anywhere past
 * it, including on a retired step, leaves it out, as the user already passed
 * it.
 */
export const resumedRestoreOffer = (
  savedId: string | null,
  hasCompletedProfileSetup: boolean
): boolean | null => {
  if (
    !savedId ||
    !reachedStep(savedId, 'pickUpWhereLeftOff', hasCompletedProfileSetup)
  )
    return null
  return (
    resumeStepId(savedId, true, hasCompletedProfileSetup) ===
    'pickUpWhereLeftOff'
  )
}

/**
 * Moving from the current step to `nextId` passes the restore step's place, so
 * whether it shows is settled from here on.
 */
export const passesRestoreStep = (nextId: StepId | undefined) =>
  stepOrder(nextId) >= stepOrder('pickUpWhereLeftOff')

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
  // A conditional step that no longer shows (e.g. the restore step once
  // nothing is offered): resume on the next step that does.
  const order = stepOrder(resumeId)
  const next =
    order >= 0
      ? visibleSteps.findIndex((s) => onboardingSteps.indexOf(s) > order)
      : -1
  return next >= 0 ? next : 0
}
