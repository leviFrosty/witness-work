import moment from 'moment'
import { isStoredDateOnLocalDay } from '@/lib/normalizeDate'
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
import i18n from '@/lib/locales'
import {
  type BuddyDayMarker,
  stackedBuddies,
} from '@/features/buddies/lib/calendarMarkers'
import type { Buddy } from '@/features/buddies/lib/state'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { hasNote as noteExists } from '@/lib/richText/notes'

/** A buddy drawn on the calendar, mirroring the in-app `BuddyAvatar`. */
export type WidgetCalendarBuddy = {
  id: string
  /** Drawn when there's no photo or emoji. Empty when the name has none. */
  initial: string
  emoji: string | null
  /** Base64 JPEG thumbnail (at most ~10 KB). */
  image: string | null
}

/** Mirrors `BuddyDayBadge`'s inputs for one day. */
export type WidgetCalendarDayBuddies = {
  /**
   * Ids into `WidgetCalendar.buddies` of who the User goes out with, stacked up
   * the cell's right edge from the corner (`stackedBuddies`).
   */
  withIds: string[]
  /** Buddies left out of `withIds`, counted in a "+N" circle atop the stack. */
  more: number
  /** Other buddies plan to go out; drawn as a dot when `withIds` is empty. */
  goingOut: boolean
  /** Pre-translated VoiceOver label naming the buddies. */
  label: string
}

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
   * `formatMinutesCompact` in-app.
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
  /** Buddy badge for the day, or `null` when there's nothing to show. */
  buddies: WidgetCalendarDayBuddies | null
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
  /** Every buddy referenced by a day's `buddies.withIds`. */
  buddies: WidgetCalendarBuddy[]
}

export type BuildCalendarArgs = {
  serviceReports: TimeEntriesByYear
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  publisher: Publisher
  /** Mirrors `preferences.logsHours` — see `tracksHours`. */
  logsHours: boolean
  startOfWeek: number
  /**
   * `YYYY-MM-DD` → buddy marker, as on the Schedule calendar. Empty when
   * Buddies is off.
   */
  buddyMarkers: Record<string, BuddyDayMarker>
}

const TOTAL_CELLS = 42

const buddyNames = (buddies: Buddy[]) =>
  buddies.map(buddyDisplayName).join(', ')

/**
 * Mirrors `BuddyDayBadge`: the avatar stack when going out together, else a
 * dot.
 */
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

/** Mirrors `toProfileAvatar` + `Avatar`'s photo → emoji → initial fallback. */
function widgetBuddy(buddy: Buddy): WidgetCalendarBuddy {
  return {
    id: buddy.inboxId,
    initial: buddyDisplayName(buddy).trim().charAt(0).toUpperCase(),
    emoji: buddy.avatar?.t === 'emoji' ? buddy.avatar.v : null,
    image: buddy.avatar?.t === 'image' ? buddy.avatar.v : null,
  }
}

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

  // Regular Publishers don't track hours unless they opt in, so the feature
  // is locked for them.
  if (!tracksHours(args.publisher, args.logsHours)) {
    return {
      locked: true,
      month,
      year,
      startOfWeek: args.startOfWeek,
      weekdayLabels,
      monthTitle: monthStart.format('MMMM YYYY'),
      days: [],
      currentWeekStart: 0,
      buddies: [],
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
  const buddies = new Map<string, WidgetCalendarBuddy>()
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
      ? monthReports.filter((r) => isStoredDateOnLocalDay(r.date, d))
      : []
    const wentInService = reportsForDay.some(isCountableEntry)
    const workedMinutes = reportsForDay.reduce(
      (acc, r) => acc + r.minutes + r.hours * 60,
      0
    )

    const dayPlansForDay = args.dayPlans.filter((p) =>
      isStoredDateOnLocalDay(p.date, d)
    )
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

    // Like the in-app calendar, other months' days get no buddy badge.
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
    buddies: [...buddies.values()],
  }
}
