import usePublisher from '@/hooks/usePublisher'
import {
  isValidMonthlyGoalHours,
  monthlyGoalKey,
  resolveMonthlyGoalHours,
  type CalendarMonth,
} from '@/lib/monthlyGoals'
import { usePreferences } from '@/stores/preferences'
import { useShallow } from 'zustand/react/shallow'

export type MonthlyGoal = {
  /** The regular Monthly Goal of the role that applied that month. */
  baseGoalHours: number
  /** The saved value for this month, or `undefined` when it uses the base. */
  overrideGoalHours: number | undefined
  /** The override when present, otherwise `baseGoalHours`. */
  effectiveGoalHours: number
  isOverridden: boolean
  setOverride: (hours: number) => void
  clearOverride: () => void
}

/**
 * React-side Monthly Goal seam for one exact calendar month. `month` follows
 * JavaScript/moment conventions (0 = January, 11 = December).
 */
const useMonthlyGoal = (target: CalendarMonth): MonthlyGoal => {
  const { monthlyGoalHours: baseGoalHours } = usePublisher(target)
  const {
    monthlyGoalOverrides,
    setMonthlyGoalOverride,
    clearMonthlyGoalOverride,
  } = usePreferences(
    useShallow((s) => ({
      monthlyGoalOverrides: s.monthlyGoalOverrides,
      setMonthlyGoalOverride: s.setMonthlyGoalOverride,
      clearMonthlyGoalOverride: s.clearMonthlyGoalOverride,
    }))
  )
  const savedOverride = monthlyGoalOverrides[monthlyGoalKey(target)]
  const overrideGoalHours = isValidMonthlyGoalHours(savedOverride)
    ? savedOverride
    : undefined

  return {
    baseGoalHours,
    overrideGoalHours,
    effectiveGoalHours: resolveMonthlyGoalHours(
      baseGoalHours,
      monthlyGoalOverrides,
      target
    ),
    isOverridden: overrideGoalHours !== undefined,
    setOverride: (hours) => setMonthlyGoalOverride(target, hours),
    clearOverride: () => clearMonthlyGoalOverride(target),
  }
}

export default useMonthlyGoal
