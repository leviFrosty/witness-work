import { usePreferences } from '../stores/preferences'
import { Publisher } from '../types/publisher'

type PublisherDetails = {
  status: Publisher
  goalHours: number
  annualGoalHours: number
  hasAnnualGoal: boolean
}

const usePublisher = (): PublisherDetails => {
  const { publisher, publisherHours } = usePreferences()

  const hasAnnualGoal = () => {
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

  const goalHours = publisherHours[publisher]

  return {
    status: publisher,
    goalHours,
    annualGoalHours: goalHours * 12,
    hasAnnualGoal: hasAnnualGoal(),
  }
}

export default usePublisher
