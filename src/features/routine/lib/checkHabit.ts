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
import useRoutine from '@/stores/routine'
import { toast } from '@/stores/toasts'
import type { ReadingPlanRun, RoutineHabit } from '@/types/routine'
import { celebratePlan } from '@/features/routine/stores/planCelebration'
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

function checkToday(habit: RoutineHabit, today: string, readAhead = false) {
  const run = habit === 'bibleReading' ? activePlan() : null
  const next = run
    ? planProgress(run, useRoutine.getState().routineEntries).next
    : null
  const earned = measureReward('routine')
  const checked = useRoutine
    .getState()
    .check(
      habit,
      today,
      run && next ? { run: run.id, portion: next.index } : {}
    )
  if (!checked) return
  const finished = run ? finishIfDone(run, today) : false
  const accessory = earned()
  if (!readAhead || accessory || finished)
    toast.success(i18n.t('routine.home.checked', { habit: label(habit) }), {
      accessory,
    })
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

export const readNextPortion = (today: string) =>
  checkToday('bibleReading', today, true)
