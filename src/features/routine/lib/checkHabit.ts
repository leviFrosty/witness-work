import moment from 'moment'
import { measureReward } from '@/lib/actionRewards'
import { analytics } from '@/lib/analytics'
import { formatDate } from '@/lib/dates'
import { daysBetween } from '@/lib/dayKeys'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { PLAN_FINISHED_COINS } from '@/lib/routine/coins'
import { routineEntryId } from '@/lib/routine/habits'
import { habitLabel } from '@/lib/routine/labels'
import { planProgress } from '@/lib/routine/readingPlans'
import usePet from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import useRoutine, { type CheckOptions } from '@/stores/routine'
import { toast } from '@/stores/toasts'
import type { ReadingPlanRun, RoutineHabit } from '@/types/routine'
import {
  celebratePlan,
  endPlanCelebration,
} from '@/features/routine/stores/planCelebration'
import { recordRoutineCheck } from '@/features/routine/stores/routineDayLog'

export function activePlan(): ReadingPlanRun | null {
  const id = usePreferences.getState().readingPlanRunId
  if (!id) return null
  const run = useRoutine.getState().readingPlans.find((plan) => plan.id === id)
  return run && !run.finishedOn ? run : null
}

function finishIfDone(run: ReadingPlanRun, today: string): boolean {
  const progress = planProgress(run, useRoutine.getState().routineEntries)
  if (!progress.finished) return false
  if (!useRoutine.getState().finishPlan(run.id, today)) return false
  const days = daysBetween(run.startedOn, today) + 1
  analytics.capture('routine_plan_finished', {
    kind: run.kind,
    days_taken: days,
  })
  celebratePlan({
    kind: run.kind,
    days,
    coins: usePet.getState().pet ? PLAN_FINISHED_COINS : null,
  })
  return true
}

const label = (habit: RoutineHabit) =>
  habitLabel(habit, usePreferences.getState().worshipKind)

function undoCheck(
  habit: RoutineHabit,
  day: string,
  { run, portion }: CheckOptions,
  finishedRun: string | null
) {
  const routine = useRoutine.getState()
  const undone =
    run !== undefined && portion !== undefined
      ? routine.uncheckPortion(day, run, portion)
      : routine.uncheck(habit, day)
  if (!undone) return
  if (finishedRun && routine.reopenPlan(finishedRun)) endPlanCelebration()
  void Haptics.light().catch(() => {})
}

function checkToday(
  habit: RoutineHabit,
  today: string,
  undoable = false,
  portion?: number
) {
  const run = habit === 'bibleReading' ? activePlan() : null
  const index =
    run && portion === undefined
      ? planProgress(run, useRoutine.getState().routineEntries).next?.index
      : portion
  const earned = measureReward('routine')
  const options: CheckOptions =
    run && index !== undefined ? { run: run.id, portion: index } : {}
  if (!useRoutine.getState().check(habit, today, options)) return
  const finished = run ? finishIfDone(run, today) : false
  const accessory = earned()
  const title = i18n.t('routine.home.checked', { habit: label(habit) })
  if (undoable)
    toast.undo({
      title,
      accessory,
      onUndo: () =>
        undoCheck(habit, today, options, finished && run ? run.id : null),
    })
  else toast.success(title, { accessory })
  if (!accessory) void Haptics.light().catch(() => {})
  recordRoutineCheck(habit, today, false)
}

function checkEarlier(habit: RoutineHabit, day: string, today: string) {
  if (!useRoutine.getState().check(habit, day)) return
  toast.success(
    i18n.t('routine.home.loggedFor', {
      habit: label(habit),
      date: formatDate(moment(day, 'YYYY-MM-DD')),
    })
  )
  void Haptics.light().catch(() => {})
  recordRoutineCheck(habit, today, true)
}

function uncheck(habit: RoutineHabit, day: string) {
  const id = routineEntryId(habit, day)
  const before = useRoutine
    .getState()
    .routineEntries.find((entry) => entry.id === id)
  if (!before || !useRoutine.getState().uncheck(habit, day)) return
  void Haptics.light().catch(() => {})
  toast.undo({
    title: i18n.t('routine.home.unchecked', { habit: label(habit) }),
    onUndo: () => {
      const { check } = useRoutine.getState()
      if (before.run && before.portions?.length)
        for (const portion of before.portions)
          check(habit, before.on, { run: before.run, portion })
      else check(habit, before.on)
    },
  })
}

export function toggleHabit({
  habit,
  day,
  today,
  done,
}: {
  habit: RoutineHabit
  day: string
  today: string
  done: boolean
}) {
  if (done) uncheck(habit, day)
  else if (day === today) checkToday(habit, today)
  else checkEarlier(habit, day, today)
}

export const markPortionRead = (today: string, portion?: number) =>
  checkToday('bibleReading', today, true, portion)

export function unmarkPortionRead(day: string, portion: number) {
  const run = activePlan()
  if (!run || !useRoutine.getState().uncheckPortion(day, run.id, portion))
    return
  void Haptics.light().catch(() => {})
}
