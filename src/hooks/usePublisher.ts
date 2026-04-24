import { getEffectiveMilestones } from '../lib/milestones'
import { usePreferences } from '../stores/preferences'
import { Publisher } from '../types/publisher'

type PublisherDetails = {
  status: Publisher
  goalHours: number
  annualGoalHours: number
  hasAnnualGoal: boolean
  milestones: number[]
}

export const hasAnnualGoal = (
  publisher: Publisher,
  userSpecifiedHasAnnualGoal: boolean | 'default'
) => {
  if (userSpecifiedHasAnnualGoal !== 'default') {
    return userSpecifiedHasAnnualGoal
  }

  switch (publisher) {
    case 'publisher':
      return false
    case 'regularAuxiliary':
      return false
    case 'circuitOverseer':
      return true
    case 'custom':
      return true
    case 'regularPioneer':
      return true
    case 'specialPioneer':
      return false
    default:
      return true
  }
}

const usePublisher = (): PublisherDetails => {
  const {
    publisher,
    publisherHours,
    userSpecifiedHasAnnualGoal,
    milestoneOverrides,
  } = usePreferences()

  const goalHours = publisherHours[publisher]
  const annualGoalHours = goalHours * 12

  return {
    status: publisher,
    goalHours,
    annualGoalHours,
    hasAnnualGoal: hasAnnualGoal(publisher, userSpecifiedHasAnnualGoal),
    milestones: getEffectiveMilestones(
      publisher,
      milestoneOverrides,
      annualGoalHours
    ),
  }
}

export default usePublisher
