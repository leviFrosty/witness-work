import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { analytics } from '@/lib/analytics'
import { MmkvStorage } from '@/stores/mmkv'
import { keepPersistedState, persist } from '@/stores/persist'
import type { RoutineHabit } from '@/types/routine'
import {
  EMPTY_DAY_LOG,
  flushDayLog,
  recordDayCheck,
  type RollupStep,
  type RoutineDayLog,
} from '@/features/routine/lib/dayRollup'

type State = { log: RoutineDayLog }

export const useRoutineDayLog = create<State>()(
  persist<State, [], [], State>(() => ({ log: EMPTY_DAY_LOG }), {
    name: 'routineDayLog',
    version: 1,
    migrate: keepPersistedState,
    storage: createJSONStorage(() => MmkvStorage),
  })
)

function apply(step: RollupStep) {
  if (step.report) analytics.capture('routine_day_logged', step.report)
  if (step.log !== useRoutineDayLog.getState().log)
    useRoutineDayLog.setState({ log: step.log })
}

export const flushRoutineDayLog = (today: string) =>
  apply(flushDayLog(useRoutineDayLog.getState().log, today))

export const recordRoutineCheck = (
  habit: RoutineHabit,
  today: string,
  backfilled: boolean
) =>
  apply(
    recordDayCheck(useRoutineDayLog.getState().log, today, habit, backfilled)
  )
