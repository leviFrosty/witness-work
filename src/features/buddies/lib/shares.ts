import moment from 'moment'
import { combineDateAndStartTime, storedDayKey } from '@/lib/normalizeDate'
import type { Contact } from '@/types/contact'
import type { DayPlan, PlanLocation } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'
import type { ShareDetails } from '@/features/buddies/lib/schemas'
import type { OutgoingShareSpec } from '@/features/buddies/lib/state'

/** Shared Plans and Follow-ups are wiped this long after they happen. */
export const SHARE_RETENTION_MS = 24 * 60 * 60 * 1000

export const planShareKey = (planId: string) => `plan:${planId}`
export const followUpShareKey = (visitId: string) => `followUp:${visitId}`

const clip = (text: string | undefined, max: number) => {
  const trimmed = text?.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

function shareLocation(
  location: PlanLocation | undefined
): ShareDetails['location'] {
  if (!location) return undefined
  const name = clip(location.name, 120)
  const address = clip(location.address, 240)
  const hasCoordinate =
    location.latitude !== undefined && location.longitude !== undefined
  if (!name && !address && !hasCoordinate) return undefined
  return {
    ...(name ? { name } : {}),
    ...(address ? { address } : {}),
    ...(hasCoordinate
      ? { latitude: location.latitude, longitude: location.longitude }
      : {}),
  }
}

/** The details a buddy receives for one of this User's Plans. */
export function planShareDetails(plan: DayPlan): ShareDetails {
  const location = shareLocation(plan.location)
  const title = clip(plan.title, 100)
  const note = clip(plan.note, 2000)
  return {
    d: storedDayKey(plan.date),
    ...(plan.startTimeInMinutes === undefined
      ? {}
      : { s: plan.startTimeInMinutes }),
    m: Math.min(Math.max(Math.round(plan.minutes), 1), 1440),
    ...(title ? { title } : {}),
    ...(location ? { location } : {}),
    ...(note ? { note } : {}),
  }
}

/**
 * The minimum a buddy needs to join a Follow-up: when, the householder's first
 * name, where, and the topic. Never the surname, phone, email, notes, or
 * history.
 */
export function followUpShareDetails(
  followUp: NonNullable<Visit['followUp']>,
  contact: Pick<Contact, 'name' | 'address' | 'coordinate'> | undefined
): ShareDetails {
  const when = moment(followUp.date)
  const firstName = clip(contact?.name.trim().split(/\s+/)[0], 40)
  const address = contact?.address
    ? [
        contact.address.line1,
        contact.address.line2,
        contact.address.city,
        contact.address.state,
      ]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(', ')
    : undefined
  const location = shareLocation({
    address,
    latitude: contact?.coordinate?.latitude,
    longitude: contact?.coordinate?.longitude,
  })
  const topic = clip(followUp.topic, 80)
  return {
    d: when.format('YYYY-MM-DD'),
    s: when.hours() * 60 + when.minutes(),
    ...(firstName ? { firstName } : {}),
    ...(location ? { location } : {}),
    ...(topic ? { topic } : {}),
  }
}

/**
 * Every Plan and Follow-up this User has invited buddies to that hasn't
 * happened yet (plus a day). Plans that came from a buddy's invitation are
 * never re-shared.
 */
export function buildOutgoingShares(input: {
  dayPlans: DayPlan[]
  visits: Visit[]
  contacts: Contact[]
  now: number
}): OutgoingShareSpec[] {
  const specs: OutgoingShareSpec[] = []
  for (const plan of input.dayPlans) {
    if (!plan.buddies?.length || plan.buddyShare) continue
    const end =
      combineDateAndStartTime(plan.date, plan.startTimeInMinutes).getTime() +
      plan.minutes * 60 * 1000
    const expiresAt = end + SHARE_RETENTION_MS
    if (expiresAt <= input.now) continue
    specs.push({
      key: planShareKey(plan.id),
      type: 'plan',
      details: planShareDetails(plan),
      recipients: plan.buddies,
      expiresAt,
    })
  }
  const contacts = new Map(input.contacts.map((c) => [c.id, c]))
  for (const visit of input.visits) {
    const followUp = visit.followUp
    if (!followUp?.buddies?.length || followUp.dismissed) continue
    const contact = contacts.get(visit.contact.id)
    if (!contact) continue
    const expiresAt = new Date(followUp.date).getTime() + SHARE_RETENTION_MS
    if (expiresAt <= input.now) continue
    specs.push({
      key: followUpShareKey(visit.id),
      type: 'followUp',
      details: followUpShareDetails(followUp, contact),
      recipients: followUp.buddies,
      expiresAt,
    })
  }
  return specs
}
