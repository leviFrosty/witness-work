import type { Visit } from '@/types/visit'

const DEFAULT_SUGGESTION_LIMIT = 5

/** Values compare case- and whitespace-insensitively. */
const normalize = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

const visitTime = (visit: Pick<Visit, 'date'>) => new Date(visit.date).getTime()

type ValueStats = { value: string; count: number; lastUsed: number }

/**
 * Groups one custom field's values across visits, keeping the most recently
 * used spelling of each value.
 */
function collectValues(visits: readonly Visit[], fieldId: string) {
  const byKey = new Map<string, ValueStats>()
  for (const visit of visits) {
    const raw = visit.customFields?.[fieldId]
    if (!raw) continue
    const key = normalize(raw)
    if (!key) continue
    const time = visitTime(visit)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, { value: raw.trim(), count: 1, lastUsed: time })
      continue
    }
    existing.count += 1
    if (time > existing.lastUsed) {
      existing.lastUsed = time
      existing.value = raw.trim()
    }
  }
  return [...byKey.values()]
}

/** One custom field's distinct values, in suggestion order. */
export type CustomFieldValueIndex = readonly {
  value: string
  /** `value` normalized, for matching what is typed. */
  key: string
}[]

/**
 * This custom field's values from other visits, most-used first, then most
 * recent, for {@link customFieldSuggestions}. Build it once while the field is
 * focused, so each keystroke filters this short list instead of walking every
 * visit again.
 */
export function customFieldValueIndex(
  visits: readonly Visit[],
  fieldId: string,
  { excludeVisitId }: { excludeVisitId?: string } = {}
): CustomFieldValueIndex {
  return collectValues(
    visits.filter((visit) => visit.id !== excludeVisitId),
    fieldId
  )
    .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)
    .map(({ value }) => ({ value, key: normalize(value) }))
}

/**
 * Values the user entered for this custom field on other visits, most-used
 * first, then most recent. Narrowed to those containing `query` (ignoring
 * case); a value that already matches `query` exactly isn't suggested.
 */
export function customFieldSuggestions(
  index: CustomFieldValueIndex,
  query: string,
  { limit = DEFAULT_SUGGESTION_LIMIT }: { limit?: number } = {}
): string[] {
  const needle = normalize(query)
  const suggestions: string[] = []
  for (const { value, key } of index) {
    if (suggestions.length >= limit) break
    if (key !== needle && key.includes(needle)) suggestions.push(value)
  }
  return suggestions
}

/**
 * The distinct values this field had on the contact's visits before `before`,
 * newest first, so the form can show what this person already received.
 */
export function contactCustomFieldHistory(
  visits: readonly Visit[],
  {
    contactId,
    fieldId,
    before,
    excludeVisitId,
  }: {
    contactId: string
    fieldId: string
    before: Date
    excludeVisitId?: string
  }
): string[] {
  if (!contactId) return []
  const cutoff = before.getTime()
  return collectValues(
    visits.filter(
      (visit) =>
        visit.contact.id === contactId &&
        visit.id !== excludeVisitId &&
        visitTime(visit) < cutoff
    ),
    fieldId
  )
    .sort((a, b) => b.lastUsed - a.lastUsed)
    .map(({ value }) => value)
}
