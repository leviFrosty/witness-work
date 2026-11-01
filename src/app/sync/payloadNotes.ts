import { parseRichText } from '@/lib/richText/parse'

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
