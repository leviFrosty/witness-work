import moment from 'moment'
import { combineDateAndStartTime, storedDayKey } from '@/lib/normalizeDate'
import { getRichNoteDoc } from '@/lib/richText/notes'
import type { Contact } from '@/types/contact'
import type { DayPlan, PlanLocation } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'
import type { ShareDetails } from '@/features/buddies/lib/schemas'
import type { OutgoingShareSpec } from '@/features/buddies/lib/state'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Shared Plans stay with buddies, photos included, this long after they end, so
 * a buddy can look back at one.
 */
export const PLAN_SHARE_RETENTION_MS = 30 * DAY_MS
/**
 * Shared Follow-ups are wiped this long after they happen: they carry a
 * householder's first name and address.
 */
export const FOLLOW_UP_SHARE_RETENTION_MS = DAY_MS
/**
 * How long after it happens a share stays with builds from before shared Plans
 * were kept a month: they read `expiresAt` alone, so it stays this, and
 * `keepUntil` carries the month.
 */
export const LEGACY_SHARE_RETENTION_MS = DAY_MS

export const planShareKey = (planId: string) => `plan:${planId}`
export const followUpShareKey = (visitId: string) => `followUp:${visitId}`

/** When a one-time Plan ends (epoch ms); a Plan with no start time is noon. */
export const planEndsAt = (plan: DayPlan) =>
  combineDateAndStartTime(plan.date, plan.startTimeInMinutes).getTime() +
  plan.minutes * 60 * 1000

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
 * When a share's buddies wipe it, as its event says: `expiresAt` for builds
 * that keep a share only a day after it happens, `keepUntil` (a month, for
 * Plans) for the rest.
 */
export function shareEventExpiry(
  spec: Pick<OutgoingShareSpec, 'endsAt' | 'expiresAt'>
): { expiresAt: number; keepUntil?: number } {
  const expiresAt = Math.min(
    spec.expiresAt,
    spec.endsAt + LEGACY_SHARE_RETENTION_MS
  )
  return spec.expiresAt > expiresAt
    ? { expiresAt, keepUntil: spec.expiresAt }
    : { expiresAt }
}

/**
 * Every Plan and Follow-up this User has invited buddies to that hasn't
 * happened yet, or happened in the last month (Plans) or day (Follow-ups).
 * Plans that came from a buddy's invitation are never re-shared.
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
    const endsAt = planEndsAt(plan)
    const expiresAt = endsAt + PLAN_SHARE_RETENTION_MS
    if (expiresAt <= input.now) continue
    const noteDoc = getRichNoteDoc(plan)
    specs.push({
      key: planShareKey(plan.id),
      type: 'plan',
      details: planShareDetails(plan),
      ...(noteDoc ? { noteDoc } : {}),
      recipients: plan.buddies,
      endsAt,
      expiresAt,
    })
  }
  const contacts = new Map(input.contacts.map((c) => [c.id, c]))
  for (const visit of input.visits) {
    const followUp = visit.followUp
    if (!followUp?.buddies?.length || followUp.dismissed) continue
    const contact = contacts.get(visit.contact.id)
    if (!contact) continue
    const endsAt = new Date(followUp.date).getTime()
    const expiresAt = endsAt + FOLLOW_UP_SHARE_RETENTION_MS
    if (expiresAt <= input.now) continue
    specs.push({
      key: followUpShareKey(visit.id),
      type: 'followUp',
      details: followUpShareDetails(followUp, contact),
      recipients: followUp.buddies,
      endsAt,
      expiresAt,
    })
  }
  return specs
}

/**
 * Who is invited to what, comparable as a string. A change here (inviting a
 * buddy, which includes saying yes to a request to join, uninviting one, or
 * deleting a shared Plan) is sent at once; detail edits can wait.
 */
export function shareRecipientsKey(
  dayPlans: DayPlan[],
  visits: Visit[]
): string {
  const entries: string[] = []
  const add = (key: string, buddies: string[]) =>
    entries.push(`${key}=${[...buddies].sort().join(',')}`)
  for (const plan of dayPlans)
    if (plan.buddies?.length && !plan.buddyShare)
      add(planShareKey(plan.id), plan.buddies)
  for (const visit of visits)
    if (visit.followUp?.buddies?.length && !visit.followUp.dismissed)
      add(followUpShareKey(visit.id), visit.followUp.buddies)
  return entries.sort().join('|')
}
