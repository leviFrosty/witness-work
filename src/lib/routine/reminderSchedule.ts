import { addDays, localDayKey } from '@/lib/dayKeys'
import { todayItems, type RoutineSettings } from '@/lib/routine/habits'
import { DEFAULT_ROUTINE_REMINDER_TIME } from '@/lib/routine/reminders'
import type {
  PersonalStudyGoal,
  RoutineEntry,
  RoutineHabit,
} from '@/types/routine'

export const ROUTINE_REMINDER_DAYS = 7

export type RoutineReminderSources = {
  settings: RoutineSettings
  entries: readonly RoutineEntry[]

  remindAt: number
}

export type RoutineReminderPreferences = {
  routineEnabled?: boolean
  routineReminders: boolean
  routineReminderTime: number
  routineHabits: readonly RoutineHabit[]
  meetingDays: readonly number[]
  personalStudyGoal: PersonalStudyGoal
  worshipDay: number | null
}

const validTime = (time: number) =>
  Number.isInteger(time) && time >= 0 && time < 24 * 60

export function routineReminderSources(
  entries: readonly RoutineEntry[],
  prefs: RoutineReminderPreferences
): RoutineReminderSources | undefined {
  if (prefs.routineEnabled !== true || !prefs.routineReminders) return undefined
  if (prefs.routineHabits.length === 0) return undefined
  return {
    settings: {
      habits: prefs.routineHabits,
      meetingDays: prefs.meetingDays,
      personalStudyGoal: prefs.personalStudyGoal,
      worshipDay: prefs.worshipDay,
    },
    entries,
    remindAt: validTime(prefs.routineReminderTime)
      ? prefs.routineReminderTime
      : DEFAULT_ROUTINE_REMINDER_TIME,
  }
}

export const openHabitsOn = (
  sources: Pick<RoutineReminderSources, 'settings' | 'entries'>,
  day: string
): RoutineHabit[] =>
  todayItems(sources.settings, sources.entries, day)
    .filter((item) => !item.done)
    .map((item) => item.habit)

export type RoutineReminderDate = {
  date: Date
  day: string
  habits: RoutineHabit[]
}

export function routineReminderDates(
  sources: RoutineReminderSources,
  now: number
): RoutineReminderDate[] {
  const today = localDayKey(new Date(now))
  const reminders: RoutineReminderDate[] = []
  for (let offset = 0; offset < ROUTINE_REMINDER_DAYS; offset++) {
    const day = addDays(today, offset)
    const habits = openHabitsOn(sources, day)
    if (habits.length === 0) continue
    const [year, month, date] = day.split('-').map(Number)
    reminders.push({
      date: new Date(year, month - 1, date, 0, sources.remindAt),
      day,
      habits,
    })
  }
  return reminders
}
