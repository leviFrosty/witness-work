import { addDays, dayNumber, weekOfDayKey } from '@/lib/dayKeys'
import {
  isWeeklyHabit,
  type PersonalStudyGoal,
  type RoutineEntry,
  type RoutineHabit,
} from '@/types/routine'

export const routineEntryId = (habit: RoutineHabit, day: string): string =>
  `${habit}:${isWeeklyHabit(habit) ? weekOfDayKey(day) : day}`

export const weekdayOf = (day: string): number => {
  const n = dayNumber(day)
  return (((n + 4) % 7) + 7) % 7
}

export const offsetInWeek = (weekday: number): number => (weekday + 6) % 7

export const midweekMeetingDay = (meetingDays: readonly number[]) =>
  meetingDays.find((day) => day >= 1 && day <= 5) ?? null

export const weekendMeetingDay = (meetingDays: readonly number[]) =>
  meetingDays.find((day) => day === 0 || day === 6) ?? null

export const meetingDaysFrom = (
  midweek: number | null,
  weekend: number | null
): number[] =>
  [midweek, weekend]
    .filter((day): day is number => day !== null)
    .sort((a, b) => a - b)

export const DEFAULT_PREP_LEAD_DAYS = 2

export const MAX_PREP_LEAD_DAYS = 6

export const PREP_LEAD_DAY_OPTIONS = Array.from(
  { length: MAX_PREP_LEAD_DAYS + 1 },
  (_, days) => days
)

export const validPrepLeadDays = (days: unknown): number =>
  typeof days === 'number' &&
  Number.isInteger(days) &&
  days >= 0 &&
  days <= MAX_PREP_LEAD_DAYS
    ? days
    : DEFAULT_PREP_LEAD_DAYS

export type RoutineSettings = {
  habits: readonly RoutineHabit[]
  meetingDays: readonly number[]
  midweekPrepLeadDays: number
  weekendPrepLeadDays: number
  personalStudyGoal: PersonalStudyGoal
  worshipDay: number | null
}

export type EntriesById = ReadonlyMap<string, RoutineEntry>

export const entriesById = (entries: readonly RoutineEntry[]): EntriesById =>
  new Map(entries.map((entry) => [entry.id, entry]))

export const isChecked = (
  byId: EntriesById,
  habit: RoutineHabit,
  day: string
): boolean => {
  const entry = byId.get(routineEntryId(habit, day))
  if (!entry) return false
  return isWeeklyHabit(habit) ? true : entry.on === day
}

export const checkedOn = (
  byId: EntriesById,
  habit: RoutineHabit,
  day: string
): string | null => byId.get(routineEntryId(habit, day))?.on ?? null

export function studiesThisWeek(
  entries: readonly RoutineEntry[],
  day: string
): number {
  const week = weekOfDayKey(day)
  const end = addDays(week, 6)
  let count = 0
  for (const entry of entries)
    if (entry.habit === 'personalStudy' && entry.on >= week && entry.on <= end)
      count++
  return count
}

function prepShows(
  meetingDay: number | null,
  leadDays: number,
  day: string
): boolean {
  if (meetingDay === null) return true
  const today = offsetInWeek(weekdayOf(day))
  const meeting = offsetInWeek(meetingDay)
  return today >= meeting - validPrepLeadDays(leadDays) && today <= meeting
}

function worshipShows(worshipDay: number | null, day: string): boolean {
  if (worshipDay === null) return true
  return offsetInWeek(weekdayOf(day)) >= offsetInWeek(worshipDay)
}

export type TodayItem = {
  habit: RoutineHabit

  done: boolean

  doneEarlier: boolean
}

export function todayItems(
  settings: RoutineSettings,
  entries: readonly RoutineEntry[],
  day: string
): TodayItem[] {
  const byId = entriesById(entries)
  const items: TodayItem[] = []
  for (const habit of settings.habits) {
    const on = checkedOn(byId, habit, day)
    const doneToday = on === day
    if (!isWeeklyHabit(habit)) {
      if (habit === 'personalStudy' && !doneToday) {
        const goal = settings.personalStudyGoal
        const due =
          goal.kind === 'days'
            ? goal.days.includes(weekdayOf(day))
            : studiesThisWeek(entries, day) < goal.times
        if (!due) continue
      }
      items.push({ habit, done: doneToday, doneEarlier: false })
      continue
    }
    if (on !== null) {
      if (doneToday) items.push({ habit, done: true, doneEarlier: false })
      continue
    }
    const shows =
      habit === 'worship'
        ? worshipShows(settings.worshipDay, day)
        : habit === 'midweekPrep'
          ? prepShows(
              midweekMeetingDay(settings.meetingDays),
              settings.midweekPrepLeadDays,
              day
            )
          : prepShows(
              weekendMeetingDay(settings.meetingDays),
              settings.weekendPrepLeadDays,
              day
            )
    if (shows) items.push({ habit, done: false, doneEarlier: false })
  }
  return items
}

export const allDone = (items: readonly TodayItem[]): boolean =>
  items.length > 0 && items.every((item) => item.done)

export function earliestBackfillDay(today: string): string {
  return addDays(weekOfDayKey(today), -7)
}

export const canLogOn = (day: string, today: string): boolean =>
  day <= today && day >= earliestBackfillDay(today)

export function habitDays(
  entries: readonly RoutineEntry[],
  habit: RoutineHabit
): string[] {
  const days: string[] = []
  for (const entry of entries) if (entry.habit === habit) days.push(entry.on)
  return days.sort()
}
