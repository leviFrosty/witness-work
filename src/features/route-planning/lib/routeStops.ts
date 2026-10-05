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
  getPlansIntersectingDay,
  type RecurringPlan,
} from '@/lib/recurrence'
import { coordinateText } from '@/features/route-planning/lib/coordinateText'

export type RouteStop = {
  /** Unique within the day: `followUp:<visitId>` or `plan:<planId>`. */
  key: string
  kind: 'followUp' | 'plan'
  /** The Contact's name, or the Plan's title or place. */
  title: string
  /** The address or place line under the title, when there is one. */
  subtitle?: string
  /** Local minutes since midnight. */
  startTimeInMinutes: number
  coordinate: Coordinate
  /**
   * What navigation apps receive: the address, as single-stop navigation does,
   * unless the pin was placed by hand or there's no address.
   */
  destination: string
}

export type DayRouteStops = {
  stops: RouteStop[]
  /** Open Follow-ups and Plans today that have no map location. */
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
  plan: { id: string; title?: string; location?: PlanLocation },
  startTimeInMinutes: number
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
    coordinate,
    destination: address || coordinateText(coordinate),
  }
}

/**
 * Today's stops: open Follow-ups for active Contacts (one per Contact) and the
 * day's Plans, each only when it has a map location, in time order. Follow-ups
 * already answered by a Visit today are done and drop out.
 */
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

  const plans = [
    ...dayPlans
      .filter((plan) => isStoredDateOnLocalDay(plan.date, day))
      .map((plan) => ({ plan, time: getStartTimeInMinutes(plan) })),
    ...getPlansIntersectingDay(day, recurringPlans).map((plan) => ({
      plan,
      time: getEffectiveStartTimeInMinutesForRecurringPlan(plan, day),
    })),
  ]
  for (const { plan, time } of plans) {
    const stop = planStop(plan, time)
    if (stop) stops.push(stop)
    // A Plan without a place isn't a stop the User forgot to locate.
    else if (plan.location) missingLocationCount++
  }

  stops.sort((a, b) => a.startTimeInMinutes - b.startTimeInMinutes)
  return { stops, missingLocationCount }
}
