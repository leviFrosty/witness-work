import i18n from '@/lib/locales'
import {
  midweekMeetingDay,
  routineEntryId,
  weekendMeetingDay,
  type RoutineSettings,
} from '@/lib/routine/habits'
import { portionLabel, weekdayName } from '@/lib/routine/labels'
import { planPortion, type PlanProgress } from '@/lib/routine/readingPlans'
import type {
  ReadingPlanRun,
  RoutineEntry,
  RoutineHabit,
} from '@/types/routine'

export function readToday(
  run: ReadingPlanRun,
  entries: readonly RoutineEntry[],
  today: string
): number | null {
  const entry = entries.find(
    (e) => e.id === routineEntryId('bibleReading', today)
  )
  if (!entry || entry.run !== run.id || !entry.portions?.length) return null
  return Math.max(...entry.portions)
}

export function itemDetail({
  habit,
  done,
  settings,
  entries,
  today,
  studies,
  plan,
}: {
  habit: RoutineHabit
  done: boolean
  settings: RoutineSettings
  entries: readonly RoutineEntry[]
  today: string
  studies: number
  plan: { run: ReadingPlanRun; progress: PlanProgress } | null
}): string | undefined {
  switch (habit) {
    case 'bibleReading': {
      if (!plan) return undefined
      const read = done ? readToday(plan.run, entries, today) : null
      const portion =
        read !== null ? planPortion(plan.run, read) : plan.progress.next
      return portion ? portionLabel(portion) : undefined
    }
    case 'personalStudy': {
      const goal = settings.personalStudyGoal
      return goal.kind === 'perWeek'
        ? i18n.t('routine.home.studyProgress', {
            done: studies,
            goal: goal.times,
          })
        : undefined
    }
    case 'midweekPrep':
    case 'weekendPrep': {
      const day =
        habit === 'midweekPrep'
          ? midweekMeetingDay(settings.meetingDays)
          : weekendMeetingDay(settings.meetingDays)
      return day === null
        ? undefined
        : i18n.t('routine.home.meetingOn', { day: weekdayName(day) })
    }
    case 'worship':
      return settings.worshipDay === null
        ? undefined
        : i18n.t('routine.home.worshipOn', {
            day: weekdayName(settings.worshipDay),
          })
  }
}
