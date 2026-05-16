import moment from 'moment'
import { DayPlan, TimeEntriesByYear } from '@/types/timeEntry'
import { Publisher } from '@/types/publisher'
import { getEntryMode } from '@/lib/publisherCapabilities'
import {
  RecurringPlan,
  getEffectiveMinutesForRecurringPlan,
  getEffectiveNoteForRecurringPlan,
  getPlansIntersectingDay,
  getMonthsReports,
} from '@/lib/serviceReport'
import { formatMinutesCompact } from '@/lib/minutes'

/** Pre-computed calendar cell mirroring `CalendarDay.tsx`'s render inputs. */
export type WidgetCalendarDay = {
  /** ISO date `YYYY-MM-DD` used as a stable id + deep-link parameter. */
  date: string
  /** 1..31 */
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  /**
   * True when the date is today or earlier — mirrors `dateInPast` in
   * CalendarDay.tsx.
   */
  isPast: boolean
  wentInService: boolean
  hasPlan: boolean
  /**
   * Pre-formatted compact planned-hours string (e.g. `"1.5h"`, `"30m"`). Empty
   * string when there is no plan or it would be zero. Matches
   * `useCompactFormattedMinutes` in-app.
   */
  plannedText: string
  /**
   * Sum of service-report minutes for the day. Kept alongside plannedText so
   * the widget can fall back to worked minutes for non-planned days if we ever
   * want that UI; currently unused but trivially small.
   */
  workedMinutes: number
  hitGoal: boolean
  hasNote: boolean
}

export type WidgetCalendar = {
  /**
   * Publishers don't have plans/hour goals, so the calendar widget is hidden
   * for them. The Swift side shows a locked placeholder when this is `true`.
   */
  locked: boolean
  /** 0-indexed month the snapshot was built for. */
  month: number
  year: number
  /** 0 = Sunday, 1 = Monday, … mirrors preferences.startOfWeek. */
  startOfWeek: number
  /** Localized short weekday labels ordered by `startOfWeek`. Length 7. */
  weekdayLabels: string[]
  /** Localized full month title, e.g. `"April 2026"`. */
  monthTitle: string
  /**
   * Full 6-week (42 cell) grid starting from the first `startOfWeek` day on or
   * before the 1st of the month. The widget filters to the current week for
   * medium size and renders the full array for large.
   */
  days: WidgetCalendarDay[]
  /**
   * Index into `days` where the current week starts (multiple of 7), or 0 if
   * today is not in the displayed month. Lets the medium-sized widget pick a
   * slice without re-computing dates in Swift.
   */
  currentWeekStart: number
}

export type BuildCalendarArgs = {
  serviceReports: TimeEntriesByYear
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  publisher: Publisher
  startOfWeek: number
}

const TOTAL_CELLS = 42

export function buildCalendar(args: BuildCalendarArgs): WidgetCalendar {
  const now = moment()
  const month = now.month()
  const year = now.year()
  const monthStart = moment().year(year).month(month).startOf('month')
  const monthEnd = monthStart.clone().endOf('month')

  // Localized short weekday labels reordered by startOfWeek.
  const baseShortDays = moment.weekdaysShort() // starts Sunday
  const weekdayLabels: string[] = []
  for (let i = 0; i < 7; i++) {
    weekdayLabels.push(baseShortDays[(args.startOfWeek + i) % 7])
  }

  // Publishers don't have an hours goal, so the feature is hidden for them.
  if (getEntryMode(args.publisher) === 'checkbox') {
    return {
      locked: true,
      month,
      year,
      startOfWeek: args.startOfWeek,
      weekdayLabels,
      monthTitle: monthStart.format('MMMM YYYY'),
      days: [],
      currentWeekStart: 0,
    }
  }

  // Walk back from the 1st to the previous startOfWeek so the grid always
  // begins on the user's preferred weekday column.
  const gridStart = monthStart.clone()
  while (gridStart.day() !== args.startOfWeek) {
    gridStart.subtract(1, 'day')
  }

  // Month reports pulled once; per-day filter below is cheap.
  const monthReports = getMonthsReports(args.serviceReports, month, year)

  const days: WidgetCalendarDay[] = []
  let currentWeekStart = 0

  for (let i = 0; i < TOTAL_CELLS; i++) {
    const d = gridStart.clone().add(i, 'days')
    const dDate = d.toDate()
    const iso = d.format('YYYY-MM-DD')
    const isCurrentMonth = d.month() === month && d.year() === year
    const isToday = d.isSame(now, 'day')
    const isPast = d.isSameOrBefore(now, 'day')

    // Reports only live in the current month bucket; skip the cross-month tail.
    const reportsForDay = isCurrentMonth
      ? monthReports.filter((r) => moment(r.date).isSame(d, 'day'))
      : []
    const wentInService = reportsForDay.length > 0
    const workedMinutes = reportsForDay.reduce(
      (acc, r) => acc + r.minutes + r.hours * 60,
      0
    )

    const dayPlan = args.dayPlans.find((p) => moment(p.date).isSame(d, 'day'))
    const recurringPlansForDay = getPlansIntersectingDay(
      dDate,
      args.recurringPlans
    )

    const highestRecurringEffectiveMinutes = recurringPlansForDay
      .map((plan) => getEffectiveMinutesForRecurringPlan(plan, dDate))
      .sort((a, b) => b - a)[0]

    const plannedMinutes =
      dayPlan?.minutes || highestRecurringEffectiveMinutes || 0
    const hasPlan = !!dayPlan || recurringPlansForDay.length > 0

    const recurringHasNote = recurringPlansForDay.some(
      (plan) => !!getEffectiveNoteForRecurringPlan(plan, dDate)
    )
    const hasNote =
      !!dayPlan?.note || reportsForDay.some((r) => !!r.note) || recurringHasNote

    const hitGoal = wentInService && hasPlan && workedMinutes >= plannedMinutes

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
    })

    if (isToday) {
      currentWeekStart = Math.floor(i / 7) * 7
    }
  }

  // Clamp: when today is outside this snapshot's month (rare at month
  // rollover), point the medium widget at the row containing the 1st.
  if (!now.isBetween(monthStart, monthEnd, 'day', '[]')) {
    currentWeekStart = 0
  }

  return {
    locked: false,
    month,
    year,
    startOfWeek: args.startOfWeek,
    weekdayLabels,
    monthTitle: monthStart.format('MMMM YYYY'),
    days,
    currentWeekStart,
  }
}
