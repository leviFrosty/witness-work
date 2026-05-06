import { monthCreditMaxMinutes } from '../constants/serviceReports'
import { getEffectiveMilestones } from './milestones'
import type { Publisher, PublisherHours } from '../types/publisher'

export type PublisherCapabilities = {
  type: Publisher
  entryMode: 'checkbox' | 'hours'
  /** `null` means no monthly credit cap (unlimited). */
  creditCapMinutes: number | null
  /**
   * Whether this role's _base_ monthly credit cap is unlimited — independent of
   * any user override. Drives settings UI that asks "should we show the
   * credit-cap override row at all for this role?"
   */
  hasUnlimitedCreditDefault: boolean
  monthlyGoalHours: number
  annualGoalHours: number
  hasAnnualGoal: boolean
  isPioneer: boolean
  /**
   * Whether this role has a pioneering/auxiliary tenure start date the app
   * displays (e.g. "regular pioneer since 2018"). False for plain publishers
   * and the custom role — they have no equivalent tenure milestone here.
   */
  tracksPioneerStartDate: boolean
  showsTimer: boolean
  showsYearTabs: boolean
  milestones: number[]
}

const PIONEER_PUBLISHERS: ReadonlyArray<Publisher> = [
  'regularPioneer',
  'specialPioneer',
  'circuitOverseer',
]

export const isPioneer = (publisher: Publisher): boolean =>
  PIONEER_PUBLISHERS.includes(publisher)

export const tracksPioneerStartDate = (publisher: Publisher): boolean =>
  isPioneer(publisher) || publisher === 'regularAuxiliary'

/**
 * Whether this role enters service time as a "did I go out?" checkbox (the
 * regular publisher role) or as hours+minutes (every other role).
 */
export const getEntryMode = (publisher: Publisher): 'checkbox' | 'hours' =>
  publisher === 'publisher' ? 'checkbox' : 'hours'

export type PublisherCapabilitiesInput = {
  publisher: Publisher
  publisherHours: PublisherHours
  userSpecifiedHasAnnualGoal: boolean | 'default'
  milestoneOverrides: number[] | null
  overrideCreditLimit: boolean
  customCreditLimitHours: number
}

const baseCreditCapMinutes = (publisher: Publisher): number | null => {
  if (publisher === 'specialPioneer' || publisher === 'circuitOverseer') {
    return null
  }
  return monthCreditMaxMinutes
}

const effectiveCreditCapMinutes = (
  publisher: Publisher,
  overrideCreditLimit: boolean,
  customCreditLimitHours: number
): number | null => {
  if (overrideCreditLimit) {
    return customCreditLimitHours === 0 ? null : customCreditLimitHours * 60
  }
  return baseCreditCapMinutes(publisher)
}

/**
 * Pure helper for non-React callers (`adjustedMinutesForSpecificMonth`, widget
 * builders) — same effective credit cap that `derivePublisherCapabilities`
 * exposes as `creditCapMinutes`.
 */
export const creditCapMinutesFor = (
  publisher: Publisher,
  override?: { enabled: boolean; customLimitHours: number }
): number | null =>
  effectiveCreditCapMinutes(
    publisher,
    override?.enabled ?? false,
    override?.customLimitHours ?? 0
  )

const roleDefaultHasAnnualGoal = (publisher: Publisher): boolean => {
  switch (publisher) {
    case 'publisher':
    case 'regularAuxiliary':
    case 'specialPioneer':
      return false
    case 'regularPioneer':
    case 'circuitOverseer':
    case 'custom':
      return true
  }
}

const effectiveHasAnnualGoal = (
  publisher: Publisher,
  userSpecified: boolean | 'default'
): boolean => {
  if (userSpecified !== 'default') return userSpecified
  return roleDefaultHasAnnualGoal(publisher)
}

export const derivePublisherCapabilities = (
  input: PublisherCapabilitiesInput
): PublisherCapabilities => {
  const {
    publisher,
    publisherHours,
    userSpecifiedHasAnnualGoal,
    milestoneOverrides,
    overrideCreditLimit,
    customCreditLimitHours,
  } = input
  const monthlyGoalHours = publisherHours[publisher]
  const annualGoalHours = monthlyGoalHours * 12
  const entryMode = getEntryMode(publisher)
  const hoursMode = entryMode === 'hours'
  return {
    type: publisher,
    entryMode,
    creditCapMinutes: effectiveCreditCapMinutes(
      publisher,
      overrideCreditLimit,
      customCreditLimitHours
    ),
    hasUnlimitedCreditDefault: baseCreditCapMinutes(publisher) === null,
    monthlyGoalHours,
    annualGoalHours,
    hasAnnualGoal: effectiveHasAnnualGoal(
      publisher,
      userSpecifiedHasAnnualGoal
    ),
    isPioneer: isPioneer(publisher),
    tracksPioneerStartDate: tracksPioneerStartDate(publisher),
    showsTimer: hoursMode,
    showsYearTabs: hoursMode,
    milestones: getEffectiveMilestones(
      publisher,
      milestoneOverrides,
      annualGoalHours
    ),
  }
}
