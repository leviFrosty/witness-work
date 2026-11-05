import { useShallow } from 'zustand/react/shallow'
import useLocalDay from '@/hooks/useLocalDay'
import {
  studiesThisWeek,
  todayItems,
  type RoutineSettings,
} from '@/lib/routine/habits'
import { planProgress, type PlanProgress } from '@/lib/routine/readingPlans'
import { usePreferences } from '@/stores/preferences'
import useRoutine from '@/stores/routine'
import type { ReadingPlanRun } from '@/types/routine'

export type ActivePlan = { run: ReadingPlanRun; progress: PlanProgress }

export default function useRoutineToday() {
  const today = useLocalDay()
  const prefs = usePreferences(
    useShallow((s) => ({
      habits: s.routineHabits,
      meetingDays: s.meetingDays,
      personalStudyGoal: s.personalStudyGoal,
      worshipDay: s.worshipDay,
      worshipKind: s.worshipKind,
      readingPlanRunId: s.readingPlanRunId,
    }))
  )
  const entries = useRoutine((s) => s.routineEntries)
  const plans = useRoutine((s) => s.readingPlans)

  const settings: RoutineSettings = {
    habits: prefs.habits,
    meetingDays: prefs.meetingDays,
    personalStudyGoal: prefs.personalStudyGoal,
    worshipDay: prefs.worshipDay,
  }
  const run = prefs.readingPlanRunId
    ? (plans.find((plan) => plan.id === prefs.readingPlanRunId) ?? null)
    : null
  const plan: ActivePlan | null =
    run && !run.finishedOn
      ? { run, progress: planProgress(run, entries) }
      : null

  return {
    today,
    settings,
    entries,
    worshipKind: prefs.worshipKind,
    items: todayItems(settings, entries, today),
    studiesThisWeek: studiesThisWeek(entries, today),
    plan,
  }
}
