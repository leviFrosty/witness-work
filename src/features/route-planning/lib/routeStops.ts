import moment from 'moment'
import type { Contact, Coordinate } from '@/types/contact'
import type { DayPlan, PlanLocation } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'
import { addressToString } from '@/lib/address'
import {
  followUpAnswer,
  isAppointment,
  visitsByContact,
} from '@/lib/conversations'
import { filterActivesContacts } from '@/lib/dismissedContacts'
import { formatPlanLocation } from '@/lib/placeSearch'
import {
  getStartTimeInMinutes,
  isStoredDateOnLocalDay,
} from '@/lib/normalizeDate'
import {
  getEffectiveStartTimeInMinutesForRecurringPlan,
  isRecurringPlanAnytimeOnDate,
  getPlansIntersectingDay,
  type RecurringPlan,
} from '@/lib/recurrence'
import { coordinateText } from '@/features/route-planning/lib/coordinateText'

export type RouteStop = {
  key: string
  kind: 'followUp' | 'plan'

  contactId?: string

  title: string

  subtitle?: string

  startTimeInMinutes: number

  anytime?: boolean

  minutes?: number
  coordinate: Coordinate

  destination: string
}

export type DayRouteStops = {
  stops: RouteStop[]

  missingLocationCount: number
}

const isCoordinate = <T extends { latitude?: number; longitude?: number }>(
  value: T | undefined
): value is T & Coordinate =>
  typeof value?.latitude === 'number' &&
  typeof value.longitude === 'number' &&
  Number.isFinite(value.latitude) &&
  Number.isFinite(value.longitude)

const minutesOfDay = (date: Date) => {
  const local = moment(date)
  return local.hours() * 60 + local.minutes()
}

const followUpStop = (visit: Visit, contact: Contact): RouteStop | null => {
  if (!isCoordinate(contact.coordinate)) return null
  const address = addressToString(contact.address).trim()
  return {
    key: `followUp:${visit.id}`,
    kind: 'followUp',
    contactId: contact.id,
    title: contact.name,
    subtitle: address || undefined,
    startTimeInMinutes: minutesOfDay(new Date(visit.followUp!.date)),
    coordinate: contact.coordinate,
    destination:
      contact.userDraggedCoordinate || !address
        ? coordinateText(contact.coordinate)
        : address,
  }
}

const planStop = (
  plan: {
    id: string
    title?: string
    minutes: number
    location?: PlanLocation
  },
  startTimeInMinutes: number,
  anytime: boolean
): RouteStop | null => {
  const location = plan.location
  if (!location || !isCoordinate(location)) return null
  const coordinate = {
    latitude: location.latitude,
    longitude: location.longitude,
  }
  const place = formatPlanLocation(location)
  const title = plan.title?.trim()
  const address = location.address?.trim()
  return {
    key: `plan:${plan.id}`,
    kind: 'plan',
    title: title || place.primary,
    subtitle: title ? place.primary : place.secondary,
    startTimeInMinutes,
    ...(anytime ? { anytime } : {}),
    minutes: plan.minutes,
    coordinate,
    destination: address || coordinateText(coordinate),
  }
}

export type PlanOnDay = {
  plan: DayPlan | RecurringPlan

  recurring: boolean

  time: number
  anytime: boolean
}

export const plansOnDay = ({
  day,
  dayPlans,
  recurringPlans,
}: {
  day: Date
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
}): PlanOnDay[] => [
  ...dayPlans
    .filter((plan) => isStoredDateOnLocalDay(plan.date, day))
    .map((plan) => ({
      plan,
      recurring: false,
      time: getStartTimeInMinutes(plan),
      anytime: !!plan.anytime,
    })),
  ...getPlansIntersectingDay(day, recurringPlans).map((plan) => ({
    plan,
    recurring: true,
    time: getEffectiveStartTimeInMinutesForRecurringPlan(plan, day),
    anytime: isRecurringPlanAnytimeOnDate(plan, day),
  })),
]

export const dayRouteStops = ({
  day,
  conversations,
  contacts,
  dayPlans,
  recurringPlans,
}: {
  day: Date
  conversations: Visit[]
  contacts: Contact[]
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
}): DayRouteStops => {
  const activeContacts = new Map(
    filterActivesContacts(contacts).map((contact) => [contact.id, contact])
  )
  const byContact = visitsByContact(conversations)
  const stops: RouteStop[] = []
  const seenContacts = new Set<string>()
  let missingLocationCount = 0

  const followUps = conversations
    .filter(
      (visit) =>
        isAppointment(visit) &&
        moment(visit.followUp!.date).isSame(day, 'day') &&
        activeContacts.has(visit.contact.id) &&
        !followUpAnswer(visit, byContact.get(visit.contact.id) ?? [])
    )
    .sort(
      (a, b) =>
        new Date(a.followUp!.date).getTime() -
        new Date(b.followUp!.date).getTime()
    )
  for (const visit of followUps) {
    if (seenContacts.has(visit.contact.id)) continue
    seenContacts.add(visit.contact.id)
    const stop = followUpStop(visit, activeContacts.get(visit.contact.id)!)
    if (stop) stops.push(stop)
    else missingLocationCount++
  }

  for (const { plan, time, anytime } of plansOnDay({
    day,
    dayPlans,
    recurringPlans,
  })) {
    const stop = planStop(plan, time, anytime)
    if (stop) stops.push(stop)
    else if (plan.location) missingLocationCount++
  }

  stops.sort((a, b) => a.startTimeInMinutes - b.startTimeInMinutes)
  return { stops, missingLocationCount }
}
