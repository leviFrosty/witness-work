import moment from 'moment'
import { calendarDayAccessibilityLabel } from '@/lib/calendarDayLabel'
import { formatDisplay } from '@/lib/dates'
import { entryMinutes } from '@/lib/entryMinutes'
import { formatMinutesCompact, formatMinutesSpoken } from '@/lib/minutes'
import {
  getEffectiveNoteForRecurringPlan,
  getPlansIntersectingDay,
  plannedMinutesForDay,
  type RecurringPlan,
} from '@/lib/recurrence'
import { hasNote as noteExists } from '@/lib/richText/notes'
import { isCountableEntry } from '@/lib/serviceReport'
import type { DayPlan, TimeEntry } from '@/types/timeEntry'

export type CalendarDayModel = {
  dateString: string

  localDay: Date
  reports: TimeEntry[]
  dayPlans: DayPlan[]

  recurringPlans: RecurringPlan[]

  planned: boolean
  loggedMinutes: number
  wentInService: boolean
  plannedMinutes: number

  noteDot: boolean

  hasNote: boolean
  loggedText: string
  plannedText: string

  dateLabel: string
}

export function buildCalendarDayModel({
  dateString,
  reports,
  dayPlans,
  recurringPlans,
}: {
  dateString: string

  reports: TimeEntry[]
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
}): CalendarDayModel {
  const localDay = moment(dateString).toDate()
  const recurringForDay = recurringPlans.length
    ? getPlansIntersectingDay(localDay, recurringPlans)
    : recurringPlans
  const planned = dayPlans.length > 0 || recurringForDay.length > 0
  const loggedMinutes = reports.reduce(
    (total, report) => total + entryMinutes(report),
    0
  )
  const plannedMinutes = planned
    ? plannedMinutesForDay(localDay, dayPlans, recurringForDay)
    : 0
  const hasNote =
    reports.some(noteExists) ||
    dayPlans.some(noteExists) ||
    recurringForDay.some((plan) =>
      noteExists(getEffectiveNoteForRecurringPlan(plan, localDay))
    )
  return {
    dateString,
    localDay,
    reports,
    dayPlans,
    recurringPlans: recurringForDay,
    planned,
    loggedMinutes,
    wentInService: reports.some(isCountableEntry),
    plannedMinutes,
    noteDot: planned ? hasNote : reports.some((report) => !!report.note),
    hasNote,
    loggedText: formatMinutesCompact(loggedMinutes),
    plannedText: formatMinutesCompact(plannedMinutes),
    dateLabel: formatDisplay(localDay, 'dddd, LL'),
  }
}

const labels = new WeakMap<
  CalendarDayModel,
  { today: string; extra: string | undefined; label: string }
>()

export function calendarDayModelLabel(
  model: CalendarDayModel,
  today: string,
  extra?: string
): string {
  const cached = labels.get(model)
  if (cached && cached.today === today && cached.extra === extra)
    return cached.label
  const label = calendarDayAccessibilityLabel(
    {
      date: model.dateLabel,
      isToday: model.dateString === today,
      isPast: model.dateString < today,
      wentInService: model.wentInService,
      loggedMinutes: model.loggedMinutes,
      hasPlan: model.planned,
      plannedMinutes: model.plannedMinutes,
      hasNote: model.hasNote,
      extra,
    },
    formatMinutesSpoken
  )
  labels.set(model, { today, extra, label })
  return label
}
