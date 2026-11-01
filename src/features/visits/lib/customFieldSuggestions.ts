import type { Visit } from '@/types/visit'

const DEFAULT_SUGGESTION_LIMIT = 5

const normalize = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

const visitTime = (visit: Pick<Visit, 'date'>) => new Date(visit.date).getTime()

type ValueStats = { value: string; count: number; lastUsed: number }

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

export type CustomFieldValueIndex = readonly {
  value: string

  key: string
}[]

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
