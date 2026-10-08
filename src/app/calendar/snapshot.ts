import type { Visit, VisitTombstone } from '@/types/visit'
import type { CalendarSnapshot } from '../../../modules/calendar-bridge'

type CalendarContact = { id: string; name: string; address?: string }

// Match the native bridge's supported range before sending a batch to EventKit.
const CALENDAR_END_LIMIT = Date.parse('2100-01-01T00:00:00Z')
const DURATION_MINUTES = 30

/**
 * Every open follow-up is published: Calendar Sync is all or nothing. Only
 * explicit domain deletions remove events; partial cloud loads cannot. Removals
 * are limited to published keys, so the payload doesn't grow with every Visit
 * ever recorded.
 */
export function buildCalendarSnapshot({
  visits,
  deletedVisits,
  contacts,
  deletedContactIds,
  publishedKeys,
  includeDetails,
  alertMinutes,
  title,
}: {
  visits: Visit[]
  deletedVisits: VisitTombstone[]
  contacts: CalendarContact[]
  deletedContactIds: string[]
  publishedKeys: string[]
  includeDetails: boolean
  /** Visit id → minutes before the follow-up its Notify Me reminder fires. */
  alertMinutes: Map<string, number>
  title: string
}): CalendarSnapshot {
  const byId = new Map(contacts.map((contact) => [contact.id, contact]))
  const deletedContacts = new Set(deletedContactIds)
  const published = new Set(publishedKeys)
  const removed = new Set(deletedVisits.map((visit) => visit.id))
  const entries: CalendarSnapshot['entries'] = []
  for (const visit of visits) {
    const followUp = visit.followUp
    if (
      !followUp ||
      followUp.dismissed ||
      deletedContacts.has(visit.contact.id)
    ) {
      removed.add(visit.id)
      continue
    }
    if (removed.has(visit.id)) continue
    const contact = byId.get(visit.contact.id)
    if (!contact) continue
    const start = new Date(followUp.date).getTime()
    const end = start + DURATION_MINUTES * 60_000
    // One malformed Visit (e.g. from an old sync payload) must not block every
    // other follow-up. Its existing event, if any, is left untouched.
    if (!Number.isFinite(start) || start < 0 || end >= CALENDAR_END_LIMIT)
      continue
    const alert = alertMinutes.get(visit.id)
    entries.push({
      ...(alert !== undefined && { alertMinutes: alert }),
      key: visit.id,
      title: includeDetails ? `${title}: ${contact.name}` : title,
      start,
      end,
      url: `witnesswork://contact/${encodeURIComponent(contact.id)}/${encodeURIComponent(visit.id)}`,
      location: includeDetails ? (contact.address ?? '') : '',
    })
  }
  return {
    title,
    deletedContactIds,
    entries,
    removed: [...removed].filter((key) => published.has(key)),
  }
}
