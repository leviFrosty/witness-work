import moment from 'moment'
import i18n from '@/lib/locales'
import { addressToString } from '@/lib/addressToString'
import {
  followUpAnswer,
  isAppointment,
  visitsByContact,
} from '@/lib/conversations'
import {
  formatMonthDayCompact,
  formatTime,
  localizeDisplayDate,
} from '@/lib/dates'
import { formatMinutesCompact } from '@/lib/minutes'
import { categoryLabel } from '@/lib/planTypeLabel'
import {
  combineDateAndStartTime,
  normalizeDateForStorage,
} from '@/lib/normalizeDate'
import { dayPlansOnLocalDay } from '@/lib/dayPlansByDay'
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

export type WatchUpNextPlace = {
  name: string | null

  address: string | null
  latitude: number | null
  longitude: number | null
}

export type WatchUpNextItem = {
  id: string
  kind: 'followUp' | 'plan'

  start: number

  timed: boolean

  day: string | null

  title: string

  detail: string | null

  durationText: string | null

  timeText: string | null

  clockText: string | null

  periodText: string | null

  weekdayText: string

  dateText: string
  place: WatchUpNextPlace | null
}

export type BuildUpNextArgs = {
  contacts: Contact[]
  conversations: Visit[]
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  categories: Category[]

  includePlans: boolean
}

const NOW_WINDOW_MINUTES = 15

const HORIZON_DAYS = 14

const MAX_ITEMS = 12

function timing(start: moment.Moment, timed: boolean) {
  const lt = start.localeData().longDateFormat('LT')
  return {
    start: start.valueOf(),
    timed,
    timeText: timed ? formatTime(start) : null,
    clockText: timed
      ? localizeDisplayDate(start.format(lt.replace(/\s*[aA]\s*/g, ' ').trim()))
      : null,
    periodText:
      timed && /[aA]/.test(lt) ? localizeDisplayDate(start.format('A')) : null,
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
        day: null,
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
    return category ? categoryLabel(category) : i18n.t('plan')
  }

  const items: WatchUpNextItem[] = []
  for (let i = 0; i <= HORIZON_DAYS; i++) {
    const day = today.clone().add(i, 'days').startOf('day')
    const dayDate = day.toDate()
    const anchor = normalizeDateForStorage(dayDate)

    const instances = [
      ...dayPlansOnLocalDay(args.dayPlans, day).map((plan) => ({
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

      const timed = startTime != null
      const start = timed
        ? moment(combineDateAndStartTime(anchor, startTime))
        : day.clone()
      if (timed && start.isBefore(earliest)) continue
      items.push({
        id,
        kind: 'plan',
        ...timing(start, timed),
        day: timed ? null : day.format('YYYY-MM-DD'),
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
