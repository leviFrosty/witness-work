import { parseRichText } from '@/lib/richText/parse'

/**
 * Sync-time check of Rich Note docs (`noteDoc`). Records keep unknown fields
 * through older builds, and the plain `note` is always there, so a doc that
 * doesn't read (a bug, or a newer format) is dropped from its record rather
 * than failing the whole file. Readable docs are kept in their parsed form,
 * which is what this build writes too, so nothing changes on a round trip.
 *
 * Runs inside `parsePayload`, per payload, before any merge; store-free (like
 * `payloadFollowUps.ts`) so it stays cheap to test.
 */
export function sanitizeNoteDocs(d: Record<string, unknown>): void {
  const conversations = (d.conversationStore as { conversations?: unknown })
    ?.conversations
  forEachRecord(conversations, sanitize)

  const reports = d.serviceReportStore as
    | {
        serviceReports?: Record<string, Record<string, unknown>>
        dayPlans?: unknown
        recurringPlans?: unknown
      }
    | undefined
  for (const months of Object.values(reports?.serviceReports ?? {})) {
    for (const entries of Object.values(months ?? {})) {
      forEachRecord(entries, sanitize)
    }
  }
  forEachRecord(reports?.dayPlans, sanitize)
  forEachRecord(reports?.recurringPlans, (plan) => {
    sanitize(plan)
    forEachRecord(plan.overrides, sanitize)
  })

  const trips = (d.mileageStore as { trips?: unknown } | null | undefined)
    ?.trips
  forEachRecord(trips, sanitize)
}

function forEachRecord(
  value: unknown,
  visit: (record: Record<string, unknown>) => void
) {
  if (!Array.isArray(value)) return
  for (const record of value) {
    if (record && typeof record === 'object') {
      visit(record as Record<string, unknown>)
    }
  }
}

function sanitize(record: Record<string, unknown>) {
  if (!('noteDoc' in record)) return
  const rich = parseRichText(record.noteDoc)
  if (rich) record.noteDoc = rich
  else delete record.noteDoc
}
