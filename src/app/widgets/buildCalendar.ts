import moment from 'moment'
import { localDayKey, storedDayKey } from '@/lib/normalizeDate'
import { dayPlansOnLocalDay } from '@/lib/dayPlansByDay'
import { DayPlan, TimeEntriesByYear } from '@/types/timeEntry'
import { Publisher } from '@/types/publisher'
import { tracksHours } from '@/lib/publisherCapabilities'
import { getMonthsReports, isCountableEntry } from '@/lib/serviceReport'
import {
  RecurringPlan,
  getEffectiveNoteForRecurringPlan,
  getPlansIntersectingDay,
  plannedMinutesForDay,
} from '@/lib/recurrence'
import { formatMinutesCompact } from '@/lib/minutes'
import { entryMinutes } from '@/lib/entryMinutes'
import i18n from '@/lib/locales'
import {
  type BuddyDayMarker,
  stackedBuddies,
} from '@/features/buddies/lib/calendarMarkers'
import type { Buddy } from '@/features/buddies/lib/state'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { hasNote as noteExists } from '@/lib/richText/notes'
import { formatDisplay } from '@/lib/dates'

export type WidgetCalendarBuddy = {
  id: string

  initial: string
  emoji: string | null

  image: string | null
}

export type WidgetCalendarDayBuddies = {
  withIds: string[]

  more: number

  goingOut: boolean

  label: string
}

export type WidgetCalendarDay = {
  date: string

  day: number
  isCurrentMonth: boolean
  isToday: boolean

  isPast: boolean
  wentInService: boolean
  hasPlan: boolean

  plannedText: string

  workedMinutes: number
  hitGoal: boolean
  hasNote: boolean

  buddies: WidgetCalendarDayBuddies | null
}

export type WidgetCalendar = {
  locked: boolean

  month: number
  year: number

  startOfWeek: number

  weekdayLabels: string[]

  monthTitle: string

  days: WidgetCalendarDay[]

  currentWeekStart: number

  buddies: WidgetCalendarBuddy[]
}

export type BuildCalendarArgs = {
  serviceReports: TimeEntriesByYear
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  publisher: Publisher

  logsHours: boolean
  startOfWeek: number

  buddyMarkers: Record<string, BuddyDayMarker>
}

const TOTAL_CELLS = 42

const buddyNames = (buddies: Buddy[]) =>
  buddies.map(buddyDisplayName).join(', ')

function dayBuddies(
  marker: BuddyDayMarker | undefined
): WidgetCalendarDayBuddies | null {
  if (!marker) return null
  if (marker.withBuddies.length > 0) {
    const { shown, more } = stackedBuddies(marker.withBuddies)
    return {
      withIds: shown.map((buddy) => buddy.inboxId),
      more,
      goingOut: false,
      label: i18n.t('buddies_withName', {
        name: buddyNames(marker.withBuddies),
      }),
    }
  }
  if (marker.goingOut.length === 0) return null
  return {
    withIds: [],
    more: 0,
    goingOut: true,
    label: i18n.t('buddies_calendarGoingOut', {
      names: buddyNames(marker.goingOut),
    }),
  }
}

function widgetBuddy(buddy: Buddy): WidgetCalendarBuddy {
  return {
    id: buddy.inboxId,
    initial: buddyDisplayName(buddy).trim().charAt(0).toUpperCase(),
    emoji: buddy.avatar?.t === 'emoji' ? buddy.avatar.v : null,
    image: buddy.avatar?.t === 'image' ? buddy.avatar.v : null,
  }
}

export function buildCalendar(
  args: BuildCalendarArgs,
  now: moment.Moment = moment()
): WidgetCalendar {
  const month = now.month()
  const year = now.year()
  const monthStart = now.clone().startOf('month')
  const monthEnd = monthStart.clone().endOf('month')

  const baseShortDays = moment.weekdaysShort()
  const weekdayLabels: string[] = []
  for (let i = 0; i < 7; i++) {
    weekdayLabels.push(baseShortDays[(args.startOfWeek + i) % 7])
  }

  if (!tracksHours(args.publisher, args.logsHours)) {
    return {
      locked: true,
      month,
      year,
      startOfWeek: args.startOfWeek,
      weekdayLabels,
      monthTitle: formatDisplay(monthStart, 'MMMM YYYY'),
      days: [],
      currentWeekStart: 0,
      buddies: [],
    }
  }

  const gridStart = monthStart.clone()
  while (gridStart.day() !== args.startOfWeek) {
    gridStart.subtract(1, 'day')
  }

  const monthReports = getMonthsReports(args.serviceReports, month, year)

  const days: WidgetCalendarDay[] = []
  const buddies = new Map<string, WidgetCalendarBuddy>()
  let currentWeekStart = 0

  for (let i = 0; i < TOTAL_CELLS; i++) {
    const d = gridStart.clone().add(i, 'days')
    const dDate = d.toDate()
    const iso = d.format('YYYY-MM-DD')
    const isCurrentMonth = d.month() === month && d.year() === year
    const isToday = d.isSame(now, 'day')
    const isPast = d.isSameOrBefore(now, 'day')

    const dayKey = localDayKey(d)
    const reportsForDay = isCurrentMonth
      ? monthReports.filter((r) => storedDayKey(r.date) === dayKey)
      : []
    const wentInService = reportsForDay.some(isCountableEntry)
    const workedMinutes = reportsForDay.reduce(
      (acc, r) => acc + entryMinutes(r),
      0
    )

    const dayPlansForDay = dayPlansOnLocalDay(args.dayPlans, d)
    const recurringPlansForDay = getPlansIntersectingDay(
      dDate,
      args.recurringPlans
    )

    const plannedMinutes = plannedMinutesForDay(
      dDate,
      dayPlansForDay,
      recurringPlansForDay
    )
    const hasPlan = dayPlansForDay.length > 0 || recurringPlansForDay.length > 0

    const recurringHasNote = recurringPlansForDay.some((plan) =>
      noteExists(getEffectiveNoteForRecurringPlan(plan, dDate))
    )
    const hasNote =
      dayPlansForDay.some(noteExists) ||
      reportsForDay.some(noteExists) ||
      recurringHasNote

    const hitGoal = wentInService && hasPlan && workedMinutes >= plannedMinutes

    const marker = isCurrentMonth ? args.buddyMarkers[iso] : undefined
    const badge = dayBuddies(marker)
    for (const buddy of marker?.withBuddies ?? []) {
      if (badge?.withIds.includes(buddy.inboxId) && !buddies.has(buddy.inboxId))
        buddies.set(buddy.inboxId, widgetBuddy(buddy))
    }

    days.push({
      date: iso,
      day: d.date(),
      isCurrentMonth,
      isToday,
      isPast,
      wentInService,
      hasPlan,
      plannedText: hasPlan ? formatMinutesCompact(plannedMinutes) : '',
      workedMinutes,
      hitGoal,
      hasNote,
      buddies: badge,
    })

    if (isToday) {
      currentWeekStart = Math.floor(i / 7) * 7
    }
  }

  if (!now.isBetween(monthStart, monthEnd, 'day', '[]')) {
    currentWeekStart = 0
  }

  return {
    locked: false,
    month,
    year,
    startOfWeek: args.startOfWeek,
    weekdayLabels,
    monthTitle: formatDisplay(monthStart, 'MMMM YYYY'),
    days,
    currentWeekStart,
    buddies: [...buddies.values()],
  }
}
