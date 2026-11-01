import { monthCreditMaxMinutes } from '@/constants/serviceReports'
import { getEffectiveMilestones } from '@/lib/milestones'
import type { StreakKind } from '@/lib/serviceStreak'
import type { Publisher, PublisherHours } from '@/types/publisher'

export type TenureType = 'fullTimeService' | 'auxiliaryPioneer'

export type PublisherCapabilities = {
  type: Publisher
  entryMode: 'checkbox' | 'hours'

  creditCapMinutes: number | null

  canAdjustCreditLimit: boolean

  hasUnlimitedCreditDefault: boolean
  monthlyGoalHours: number
  annualGoalHours: number
  hasAnnualGoal: boolean

  isInFullTimeService: boolean

  tenureType: TenureType | null

  tracksTenure: boolean

  showsTimeEntry: boolean
  showsTimer: boolean
  showsYearTabs: boolean

  streakKind: StreakKind
  milestones: number[]
}

export const getTenureType = (publisher: Publisher): TenureType | null => {
  switch (publisher) {
    case 'regularPioneer':
    case 'specialPioneer':
    case 'circuitOverseer':
      return 'fullTimeService'
    case 'regularAuxiliary':
      return 'auxiliaryPioneer'
    case 'publisher':
    case 'custom':
      return null
  }
}

export const isInFullTimeService = (publisher: Publisher): boolean =>
  getTenureType(publisher) === 'fullTimeService'

export const tracksTenure = (publisher: Publisher): boolean =>
  getTenureType(publisher) !== null

export const getEntryMode = (publisher: Publisher): 'checkbox' | 'hours' =>
  publisher === 'publisher' ? 'checkbox' : 'hours'

export const tracksHours = (
  publisher: Publisher,
  logsHours: boolean
): boolean => getEntryMode(publisher) === 'hours' || logsHours

export const getStreakKind = (publisher: Publisher): StreakKind =>
  getEntryMode(publisher) === 'checkbox' ? 'months' : 'plans'

export type PublisherCapabilitiesInput = {
  publisher: Publisher
  publisherHours: PublisherHours
  userSpecifiedHasAnnualGoal: boolean | 'default'
  milestoneOverrides: number[] | null
  overrideCreditLimit: boolean
  customCreditLimitHours: number

  logsHours: boolean

  annualGoalHours?: number
}

const baseCreditCapMinutes = (publisher: Publisher): number | null => {
  if (publisher === 'specialPioneer' || publisher === 'circuitOverseer') {
    return null
  }
  return monthCreditMaxMinutes
}

const canAdjustCreditLimit = (publisher: Publisher): boolean =>
  isInFullTimeService(publisher) || publisher === 'custom'

const effectiveCreditCapMinutes = (
  publisher: Publisher,
  overrideCreditLimit: boolean,
  customCreditLimitHours: number
): number | null => {
  if (canAdjustCreditLimit(publisher) && overrideCreditLimit) {
    return customCreditLimitHours === 0 ? null : customCreditLimitHours * 60
  }
  return baseCreditCapMinutes(publisher)
}

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

export const effectiveHasAnnualGoal = (
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
    logsHours,
  } = input
  const monthlyGoalHours = publisherHours[publisher]
  const annualGoalHours = input.annualGoalHours ?? monthlyGoalHours * 12
  const entryMode = getEntryMode(publisher)
  const showsTimeEntry = tracksHours(publisher, logsHours)
  return {
    type: publisher,
    entryMode,
    creditCapMinutes: effectiveCreditCapMinutes(
      publisher,
      overrideCreditLimit,
      customCreditLimitHours
    ),
    canAdjustCreditLimit: canAdjustCreditLimit(publisher),
    hasUnlimitedCreditDefault: baseCreditCapMinutes(publisher) === null,
    monthlyGoalHours,
    annualGoalHours,
    hasAnnualGoal: effectiveHasAnnualGoal(
      publisher,
      userSpecifiedHasAnnualGoal
    ),
    isInFullTimeService: isInFullTimeService(publisher),
    tenureType: getTenureType(publisher),
    tracksTenure: tracksTenure(publisher),
    showsTimeEntry,
    showsTimer: showsTimeEntry,
    showsYearTabs: showsTimeEntry,
    streakKind: getStreakKind(publisher),
    milestones: getEffectiveMilestones(
      publisher,
      milestoneOverrides,
      annualGoalHours
    ),
  }
}
