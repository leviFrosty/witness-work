import type {
  AndroidCalendarEvent,
  AndroidEventWrite,
  CalendarEntry,
  CalendarSnapshot,
} from '../../../modules/calendar-bridge'

/**
 * Android identifies its events by a link in the event description, the
 * counterpart of the iOS event URL. CalendarContract has no app-writable field
 * that syncs: `SYNC_DATA*` and extended properties belong to the account's sync
 * adapter, and Google leaves `UID_2445` empty. Descriptions reach the server
 * and every device, so two Android devices publishing into one Google calendar
 * find each other's events and converge on one per Follow-up.
 */
const MARKER =
  /witnesswork:\/\/contact\/([^/\s?"'<>]+)\/[^\s?"'<>]*\?([^\s"'<>]+)/

/** Whole minutes, at most four weeks ahead; anything else means no alert. */
function alert(entry: CalendarEntry) {
  const minutes = entry.alertMinutes
  if (minutes === undefined || !Number.isFinite(minutes)) return undefined
  if (minutes < 0 || minutes > 40_320) return undefined
  return Math.round(minutes)
}

/**
 * The alert is part of the marker, as on iOS: a Notify Me change rewrites the
 * event, while reminders a provider adds itself (Google's default
 * notifications) don't cause a rewrite on every sync.
 */
export function eventDescription(entry: CalendarEntry) {
  return `${entry.url}?followUp=${encodeURIComponent(entry.key)}&alert=${alert(entry) ?? 'none'}`
}

function decode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

/**
 * Tolerates text around the link and the HTML a provider may turn it into (a
 * link, `&amp;`), so reformatting alone never rewrites an event.
 */
export function parseEventMarker(description: string) {
  const match = MARKER.exec(description)
  if (!match) return null
  const params = new Map(
    match[2].split(/&(?:amp;)?/).map((pair) => {
      const [name, value = ''] = pair.split('=')
      return [name, value] as const
    })
  )
  const key = decode(params.get('followUp') ?? '')
  const contactId = decode(match[1])
  return key && contactId
    ? { key, contactId, alert: params.get('alert') ?? '' }
    : null
}

const sameMarker = (current: string, wanted: string) => {
  const [a, b] = [parseEventMarker(current), parseEventMarker(wanted)]
  return (
    !!a &&
    !!b &&
    a.key === b.key &&
    a.contactId === b.contactId &&
    a.alert === b.alert
  )
}

/**
 * Every device must keep the same copy: synced events first (a server id is the
 * same everywhere), then the lowest id.
 */
function rank(a: AndroidCalendarEvent, b: AndroidCalendarEvent) {
  if (a.syncId !== b.syncId) {
    if (a.syncId === null) return 1
    if (b.syncId === null) return -1
    return a.syncId < b.syncId ? -1 : 1
  }
  return Number(a.id) - Number(b.id)
}

/**
 * Upserts by Follow-up key. Like iOS, only explicit removals delete events, so
 * a device missing some data (or another device's Follow-ups) never removes
 * them; past Follow-ups aren't added, but existing events still update. Unlike
 * iOS, a missing upcoming event is simply recreated.
 */
export function planAndroidPublish({
  events,
  snapshot,
  includeDetails,
  now,
}: {
  events: AndroidCalendarEvent[]
  snapshot: CalendarSnapshot
  includeDetails: boolean
  now: number
}) {
  const deletedContacts = new Set(snapshot.deletedContactIds)
  const removed = new Set(snapshot.removed)
  const groups = new Map<string, AndroidCalendarEvent[]>()
  const deletes: string[] = []
  for (const event of events) {
    const marker = parseEventMarker(event.description)
    if (!marker) continue
    if (removed.has(marker.key) || deletedContacts.has(marker.contactId)) {
      deletes.push(event.id)
      continue
    }
    groups.set(marker.key, [...(groups.get(marker.key) ?? []), event])
  }
  const writes: AndroidEventWrite[] = []
  const entries = new Map(snapshot.entries.map((entry) => [entry.key, entry]))
  for (const [key, group] of groups) {
    const [kept, ...duplicates] = group.sort(rank)
    deletes.push(...duplicates.map((duplicate) => duplicate.id))
    const entry = entries.get(key)
    if (entry) {
      const write = entryWrite(entry)
      if (
        kept.title !== write.title ||
        kept.start !== write.start ||
        kept.end !== write.end ||
        kept.location !== write.location ||
        !sameMarker(kept.description, write.description) ||
        kept.allDay
      )
        writes.push({ ...write, id: kept.id })
    } else if (
      !includeDetails &&
      (kept.title !== snapshot.title || kept.location !== '')
    ) {
      // Its Visit is missing here, but turning off names and addresses must
      // still redact it.
      writes.push({
        id: kept.id,
        title: snapshot.title,
        start: kept.start,
        end: kept.end,
        location: '',
        description: kept.description,
        resetAlert: false,
      })
    }
  }
  for (const entry of snapshot.entries) {
    if (!groups.has(entry.key) && entry.start >= now)
      writes.push(entryWrite(entry))
  }
  return { writes, deletes }
}

function entryWrite(entry: CalendarEntry): AndroidEventWrite {
  const minutes = alert(entry)
  return {
    title: entry.title,
    start: entry.start,
    end: entry.end,
    location: entry.location,
    description: eventDescription(entry),
    ...(minutes !== undefined && { alertMinutes: minutes }),
    resetAlert: true,
  }
}
