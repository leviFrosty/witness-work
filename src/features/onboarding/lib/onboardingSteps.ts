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

export interface StepShowIfContext {
  publisher: Publisher
  publisherHours: PublisherHours
  logsHours: boolean
  installedOn: Date
  userSpecifiedHasAnnualGoal: boolean | 'default'

  hasCatchUpReports: boolean

  buddiesAvailable: boolean

  calendarAvailable: boolean
}

export interface StepDef {
  id: StepId

  countsTowardProgress: boolean

  showIf?: (ctx: StepShowIfContext) => boolean
}

export const onboardingSteps: StepDef[] = [
  { id: 'hero', countsTowardProgress: false },
  { id: 'featureTour', countsTowardProgress: false },
  { id: 'pickUpWhereLeftOff', countsTowardProgress: false },
  { id: 'publisherType', countsTowardProgress: true },
  {
    id: 'hoursLogging',
    countsTowardProgress: true,

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

    showIf: ({ publisher, publisherHours, logsHours }) =>
      tracksHours(publisher, logsHours) && publisherHours[publisher] > 0,
  },
  { id: 'dataProtection', countsTowardProgress: true },
  {
    id: 'buddies',
    countsTowardProgress: true,

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

  { id: 'founderNote', countsTowardProgress: false },
]

export const visibleOnboardingSteps = (ctx: StepShowIfContext) =>
  onboardingSteps.filter((s) => !s.showIf || s.showIf(ctx))

const resumeStepId = (
  savedId: string,
  hasPlanMonth: boolean,
  hasCompletedProfileSetup: boolean
) => {
  if (savedId === 'supporter') return 'founderNote'

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

export const reachedStep = (
  current: string | null,
  id: StepId,
  hasCompletedProfileSetup: boolean
) => {
  if (!current) return false

  const resumeId = resumeStepId(current, true, hasCompletedProfileSetup)
  const index = onboardingSteps.findIndex((step) => step.id === resumeId)
  return (
    index >= 0 && index >= onboardingSteps.findIndex((step) => step.id === id)
  )
}

export const resumeStepIndex = (
  savedId: string | null,
  visibleSteps: StepDef[],
  hasCompletedProfileSetup: boolean
) => {
  if (!savedId) return 0

  if (savedId === 'supporter') return visibleSteps.length - 1
  const resumeId = resumeStepId(
    savedId,
    visibleSteps.some((s) => s.id === 'planMonth'),
    hasCompletedProfileSetup
  )
  const idx = visibleSteps.findIndex((s) => s.id === resumeId)
  if (idx >= 0) return idx

  const order = onboardingSteps.findIndex((s) => s.id === resumeId)
  const next =
    order >= 0
      ? visibleSteps.findIndex((s) => onboardingSteps.indexOf(s) > order)
      : -1
  return next >= 0 ? next : 0
}
