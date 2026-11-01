import moment from 'moment'
import { combineDateAndStartTime, storedDayKey } from '@/lib/normalizeDate'
import { getRichNoteDoc } from '@/lib/richText/notes'
import type { Contact } from '@/types/contact'
import type { DayPlan, PlanLocation, PlanTombstone } from '@/types/timeEntry'
import type { Visit, VisitTombstone } from '@/types/visit'
import type { ShareDetails } from '@/features/buddies/lib/schemas'
import type { OutgoingShareSpec } from '@/features/buddies/lib/state'

const DAY_MS = 24 * 60 * 60 * 1000

export const PLAN_SHARE_RETENTION_MS = 30 * DAY_MS

export const FOLLOW_UP_SHARE_RETENTION_MS = DAY_MS

export const LEGACY_SHARE_RETENTION_MS = DAY_MS

export const planShareKey = (planId: string) => `plan:${planId}`
export const followUpShareKey = (visitId: string) => `followUp:${visitId}`

export const planEndsAt = (plan: DayPlan) =>
  plan.anytime
    ? combineDateAndStartTime(plan.date, 24 * 60).getTime()
    : combineDateAndStartTime(plan.date, plan.startTimeInMinutes).getTime() +
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

export function planShareDetails(plan: DayPlan): ShareDetails {
  const location = shareLocation(plan.location)
  const title = clip(plan.title, 100)
  const note = clip(plan.note, 2000)
  return {
    d: storedDayKey(plan.date),

    ...(plan.anytime || plan.startTimeInMinutes === undefined
      ? {}
      : { s: plan.startTimeInMinutes }),
    m: Math.min(Math.max(Math.round(plan.minutes), 1), 1440),
    ...(title ? { title } : {}),
    ...(location ? { location } : {}),
    ...(note ? { note } : {}),
  }
}

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
      ...(plan.updatedAt ? { version: plan.updatedAt } : {}),
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

    const version = Math.max(visit.updatedAt ?? 0, contact.updatedAt ?? 0)
    specs.push({
      key: followUpShareKey(visit.id),
      type: 'followUp',
      details: followUpShareDetails(followUp, contact),
      recipients: followUp.buddies,
      endsAt,
      expiresAt,
      ...(version ? { version } : {}),
    })
  }
  return specs
}

export function shareWithdrawnAt(
  key: string,
  data: {
    dayPlans: DayPlan[]
    deletedDayPlans: PlanTombstone[]
    visits: Visit[]
    deletedVisits: VisitTombstone[]
  }
): number | undefined {
  const { kind, id } = parseShareKey(key)
  const [records, tombstones] =
    kind === 'plan'
      ? [data.dayPlans, data.deletedDayPlans]
      : kind === 'followUp'
        ? [data.visits, data.deletedVisits]
        : [[], []]
  const stamps = [
    records.find((record) => record.id === id)?.updatedAt,
    tombstones.find((tombstone) => tombstone.id === id)?.deletedAt,
  ].filter((stamp): stamp is number => stamp !== undefined)
  return stamps.length > 0 ? Math.max(...stamps) : undefined
}

export function shareEndsAt(
  key: string,
  data: { dayPlans: DayPlan[]; visits: Visit[] }
): number | undefined {
  const { kind, id } = parseShareKey(key)
  if (kind === 'plan') {
    const plan = data.dayPlans.find((record) => record.id === id)
    return plan && !plan.buddyShare ? planEndsAt(plan) : undefined
  }
  if (kind === 'followUp') {
    const followUp = data.visits.find((record) => record.id === id)?.followUp
    return followUp && !followUp.dismissed
      ? new Date(followUp.date).getTime()
      : undefined
  }
  return undefined
}

function parseShareKey(key: string) {
  const separator = key.indexOf(':')
  return { kind: key.slice(0, separator), id: key.slice(separator + 1) }
}

export function sharedKeys(dayPlans: DayPlan[], visits: Visit[]): Set<string> {
  const keys = new Set<string>()
  for (const plan of dayPlans)
    if (plan.buddies?.length && !plan.buddyShare)
      keys.add(planShareKey(plan.id))
  for (const visit of visits)
    if (visit.followUp?.buddies?.length && !visit.followUp.dismissed)
      keys.add(followUpShareKey(visit.id))
  return keys
}

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
