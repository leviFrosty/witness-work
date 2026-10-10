import moment from 'moment'
import i18n, { TranslationKey } from '@/lib/locales'
import { addressToString } from '@/lib/addressToString'
import {
  followUpAnswer,
  isAppointment,
  visitsByContact,
} from '@/lib/conversations'
import { formatMonthDayCompact, formatTime } from '@/lib/dates'
import { formatMinutesCompact } from '@/lib/minutes'
import {
  combineDateAndStartTime,
  isStoredDateOnLocalDay,
  normalizeDateForStorage,
} from '@/lib/normalizeDate'
import {
  getEffectiveMinutesForRecurringPlan,
  getPlansIntersectingDay,
  getSetStartTimeInMinutesForRecurringPlan,
  isRecurringPlanAnytimeOnDate,
  RecurringPlan,
} from '@/lib/recurrence'
import { Category } from '@/types/category'
import { Contact } from '@/types/contact'
import { DayPlan, PlanLocation } from '@/types/timeEntry'
import { Visit } from '@/types/visit'

/** Where Directions on the watch go. */
export type WatchUpNextPlace = {
  name: string | null
  /** Searchable address, used when there's no coordinate. */
  address: string | null
  latitude: number | null
  longitude: number | null
}

/**
 * A Follow-up or Plan instance for the watch's Up Next. Mirrors `UpNextItem` in
 * `WatchProtocol.swift`. The watch picks what to show from these by the time,
 * so it stays right without the iPhone.
 */
export type WatchUpNextItem = {
  /** Visit id, Day Plan id, or `<Recurring Plan id>:<YYYY-MM-DD>`. */
  id: string
  kind: 'followUp' | 'plan'
  /** Epoch ms of the start; local midnight of its day when not `timed`. */
  start: number
  /** False for a Plan without a start time, which spans its day. */
  timed: boolean
  /** The Contact's name, or the Plan's title or Type. */
  title: string
  /** The Follow-up's topic or street, or the Plan's place. */
  detail: string | null
  /** Planned duration, compact (`2h`). Plans only. */
  durationText: string | null
  /** Start time in the app's time format; `null` when not `timed`. */
  timeText: string | null
  /** `timeText` without its AM/PM marker, e.g. `3:00`. */
  clockText: string | null
  /** The AM/PM marker of 12-hour time, e.g. `PM`; otherwise `null`. */
  periodText: string | null
  /** Short weekday, e.g. `Thu`. */
  weekdayText: string
  /** Short date, e.g. `Oct 14`. */
  dateText: string
  place: WatchUpNextPlace | null
}

export type BuildUpNextArgs = {
  contacts: Contact[]
  conversations: Visit[]
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  categories: Category[]
  /** Plans are only for roles that track hours, like the Schedule. */
  includePlans: boolean
}

/**
 * How long a started item stays up, so its place and topic are there on
 * arrival. Mirrors `UpNext.nowWindow` on the watch.
 */
const NOW_WINDOW_MINUTES = 15
/** Days after today to look ahead. */
const HORIZON_DAYS = 14
/** Enough for the watch to keep advancing while the iPhone is away. */
const MAX_ITEMS = 12

function timing(start: moment.Moment, timed: boolean) {
  // The app's time format (`LT`), split so a round complication can show the
  // marker smaller than the time.
  const lt = start.localeData().longDateFormat('LT')
  return {
    start: start.valueOf(),
    timed,
    timeText: timed ? formatTime(start) : null,
    clockText: timed
      ? start.format(lt.replace(/\s*[aA]\s*/g, ' ').trim())
      : null,
    periodText: timed && /[aA]/.test(lt) ? start.format('A') : null,
    weekdayText: start.format('ddd'),
    dateText: formatMonthDayCompact(start),
  }
}

function followUpItems(
  args: BuildUpNextArgs,
  earliest: moment.Moment,
  latest: moment.Moment
): WatchUpNextItem[] {
  const contactsById = new Map(args.contacts.map((c) => [c.id, c]))
  // Answered Follow-ups (a later Visit that day) are done, matching the Home
  // card and the Appointments widget.
  const byContact = visitsByContact(args.conversations)

  return args.conversations.flatMap((visit): WatchUpNextItem[] => {
    if (!isAppointment(visit) || !visit.followUp) return []
    const start = moment(visit.followUp.date)
    if (!start.isValid() || start.isBefore(earliest) || start.isAfter(latest))
      return []
    if (followUpAnswer(visit, byContact.get(visit.contact.id) ?? [])) return []
    const contact = contactsById.get(visit.contact.id)
    if (!contact) return []

    const address = addressToString(contact.address) || null
    return [
      {
        id: visit.id,
        kind: 'followUp',
        ...timing(start, true),
        title: contact.name,
        detail:
          visit.followUp.topic?.trim() ||
          contact.address?.line1?.trim() ||
          null,
        durationText: null,
        place:
          address || contact.coordinate
            ? {
                name: contact.name,
                address,
                latitude: contact.coordinate?.latitude ?? null,
                longitude: contact.coordinate?.longitude ?? null,
              }
            : null,
      },
    ]
  })
}

function planPlace(location?: PlanLocation): WatchUpNextPlace | null {
  if (!location) return null
  const place = {
    name: location.name?.trim() || null,
    address: location.address?.trim() || null,
    latitude: location.latitude ?? null,
    longitude: location.longitude ?? null,
  }
  return place.address || (place.latitude != null && place.longitude != null)
    ? place
    : null
}

function planItems(
  args: BuildUpNextArgs,
  today: moment.Moment,
  earliest: moment.Moment
): WatchUpNextItem[] {
  const categoriesById = new Map(args.categories.map((c) => [c.id, c]))
  const titleOf = (plan: DayPlan | RecurringPlan) => {
    if (plan.title?.trim()) return plan.title.trim()
    const category = plan.categoryId
      ? categoriesById.get(plan.categoryId)
      : undefined
    return category
      ? i18n.t(category.name as TranslationKey, {
          defaultValue: category.name,
        })
      : i18n.t('plan')
  }

  const items: WatchUpNextItem[] = []
  for (let i = 0; i <= HORIZON_DAYS; i++) {
    const day = today.clone().add(i, 'days')
    const dayDate = day.toDate()
    const anchor = normalizeDateForStorage(dayDate)
    // Every Plan on the day is shown, as on the Schedule, including ones the
    // forecast doesn't count.
    const instances = [
      ...args.dayPlans
        .filter((plan) => isStoredDateOnLocalDay(plan.date, day))
        .map((plan) => ({
          id: plan.id,
          plan,
          minutes: plan.minutes,
          startTime: plan.anytime ? undefined : plan.startTimeInMinutes,
        })),
      ...getPlansIntersectingDay(dayDate, args.recurringPlans).map((plan) => ({
        id: `${plan.id}:${day.format('YYYY-MM-DD')}`,
        plan,
        minutes: getEffectiveMinutesForRecurringPlan(plan, dayDate),
        startTime: isRecurringPlanAnytimeOnDate(plan, dayDate)
          ? undefined
          : getSetStartTimeInMinutesForRecurringPlan(plan, dayDate),
      })),
    ]

    for (const { id, plan, minutes, startTime } of instances) {
      if (minutes <= 0) continue
      // A Plan without a time spans its day; the app's noon default is only
      // for sorting and never shown as a time here.
      const timed = startTime != null
      const start = timed
        ? moment(combineDateAndStartTime(anchor, startTime))
        : day.clone()
      if (timed && start.isBefore(earliest)) continue
      items.push({
        id,
        kind: 'plan',
        ...timing(start, timed),
        title: titleOf(plan),
        detail:
          plan.location?.name?.trim() || plan.location?.address?.trim() || null,
        durationText: formatMinutesCompact(minutes),
        place: planPlace(plan.location),
      })
    }
  }
  return items
}

/**
 * Follow-ups and Plans from now through the next two weeks, in the order the
 * watch shows them: by day, timed items before a day's untimed Plans, then by
 * start, a Follow-up before a Plan at the same time (someone is expecting you).
 * Overdue Follow-ups are left to the iPhone's missed list.
 */
export function buildUpNext(args: BuildUpNextArgs): WatchUpNextItem[] {
  const now = moment()
  const today = now.clone().startOf('day')
  const earliest = now.clone().subtract(NOW_WINDOW_MINUTES, 'minutes')
  const latest = today.clone().add(HORIZON_DAYS, 'days').endOf('day')

  const items = [
    ...followUpItems(args, earliest, latest),
    ...(args.includePlans ? planItems(args, today, earliest) : []),
  ]

  const dayOf = (item: WatchUpNextItem) =>
    moment(item.start).startOf('day').valueOf()
  items.sort(
    (a, b) =>
      dayOf(a) - dayOf(b) ||
      Number(!a.timed) - Number(!b.timed) ||
      a.start - b.start ||
      Number(a.kind === 'plan') - Number(b.kind === 'plan') ||
      a.id.localeCompare(b.id)
  )
  return items.slice(0, MAX_ITEMS)
}
