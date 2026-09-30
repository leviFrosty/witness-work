import type { Category } from '@/types/category'
import type { CustomFieldDefinition } from '@/types/customField'
import type { Contact } from '@/types/contact'
import type { TimeEntriesByYear, DayPlan } from '@/types/timeEntry'
import type { RecurringPlan } from '@/lib/serviceReport'
import { canonicalJson } from '@/lib/canonicalJson'

type Definition = { id: string; updatedAt?: number; legacyIds?: string[] }

/** Shared aliases join a component even when peers renamed it differently. */
function identityComponents<T extends Definition>(
  records: T[],
  signature?: (record: T) => string
): Map<string, string[]> {
  const parents = new Map<string, string>()
  const root = (id: string): string => {
    let current = id
    while (parents.has(current) && parents.get(current) !== current)
      current = parents.get(current)!
    parents.set(id, current)
    return current
  }
  const join = (a: string, b: string) => {
    const ar = root(a),
      br = root(b)
    parents.set(ar, br)
  }
  const signatures = new Map<string, string>()
  for (const record of records) {
    root(record.id)
    for (const alias of record.legacyIds ?? []) join(record.id, alias)
    if (signature) {
      const key = signature(record)
      const previous = signatures.get(key)
      if (previous !== undefined) join(record.id, previous)
      signatures.set(key, record.id)
    }
  }
  const groups = new Map<string, string[]>()
  for (const id of parents.keys()) {
    const key = root(id)
    const group = groups.get(key) ?? []
    group.push(id)
    groups.set(key, group)
  }
  const byId = new Map<string, string[]>()
  for (const group of groups.values()) {
    group.sort()
    for (const id of group) byId.set(id, group)
  }
  return byId
}

/** A deletion from an unreconciled peer must cover its canonical aliases. */
export function expandDefinitionTombstones<
  T extends { id: string; deletedAt: number; legacyIds?: string[] },
>(records: Definition[], tombstones: T[]): T[] {
  const components = identityComponents([...records, ...tombstones])
  return tombstones.map((tombstone) => {
    const aliases = components
      .get(tombstone.id)!
      .filter((id) => id !== tombstone.id)
    return aliases.length ? { ...tombstone, legacyIds: aliases } : tombstone
  })
}

function reconcile<T extends Definition>(
  records: T[],
  signature: (record: T) => string,
  canCombine: (ids: string[]) => boolean = () => true
) {
  const aliases = new Map<string, string>()
  const components = identityComponents(records, signature)
  const groups = new Map<string, T[]>()
  for (const record of records) {
    const key = components.get(record.id)![0]
    const group = groups.get(key) ?? []
    group.push(record)
    groups.set(key, group)
  }
  const result: T[] = []
  for (const group of groups.values()) {
    const ids = group.map((record) => record.id)
    const allIds = components.get(group[0].id)!
    const winner = [...group].sort(
      (a, b) =>
        (b.updatedAt ?? 0) - (a.updatedAt ?? 0) ||
        (canonicalJson(a) < canonicalJson(b) ? 1 : -1)
    )[0]
    if (!canCombine(allIds)) {
      // A stale contact can reveal a conflict after an earlier cleanup. Keep
      // both definitions/values rather than applying an existing alias map.
      for (const id of allIds) aliases.delete(id)
      for (const record of group) {
        const { legacyIds: _aliases, ...preserved } = record
        result.push(preserved as T)
      }
      for (const id of allIds)
        if (!ids.includes(id)) {
          const { legacyIds: _aliases, ...preserved } = winner
          result.push({ ...preserved, id } as T)
        }
      continue
    }
    if (allIds.length === 1) {
      result.push(...group)
      continue
    }
    const canonicalId = allIds[0]
    const legacyIds = allIds.filter((id) => id !== canonicalId)
    result.push({ ...winner, id: canonicalId, legacyIds })
    for (const id of legacyIds) aliases.set(id, canonicalId)
  }
  return { records: result.sort((a, b) => a.id.localeCompare(b.id)), aliases }
}

/** Repair identical definitions left by the old per-device UUID migrations. */
export function reconcileSyncDefinitions<
  T extends {
    categories: Category[]
    customFieldDefs: CustomFieldDefinition[]
    contacts: Contact[]
    deletedContacts: Contact[]
    serviceReports: TimeEntriesByYear
    dayPlans: DayPlan[]
    recurringPlans: RecurringPlan[]
  },
>(state: T): T {
  const categories = reconcile(
    state.categories,
    (record) => `category:${record.name}:${record.isCredit}:${!!record.builtin}`
  )
  const allContacts = [...state.contacts, ...state.deletedContacts]
  const fields = reconcile(
    state.customFieldDefs,
    (record) =>
      `field:${record.label}:${record.type ?? 'text'}:${!!record.archived}`,
    (ids) =>
      allContacts.every(
        (contact) =>
          new Set(
            ids
              .map((id) => contact.customFields?.[id])
              .filter((value) => value !== undefined)
          ).size <= 1
      )
  )
  const patchContact = (contact: Contact): Contact => {
    if (!contact.customFields || fields.aliases.size === 0) return contact
    const customFields: Record<string, string> = {}
    for (const [id, value] of Object.entries(contact.customFields))
      customFields[fields.aliases.get(id) ?? id] = value
    return { ...contact, customFields }
  }
  const patchCategory = <R extends { categoryId?: string }>(record: R): R => {
    const id = record.categoryId && categories.aliases.get(record.categoryId)
    return id ? { ...record, categoryId: id } : record
  }
  return {
    ...state,
    categories: categories.records,
    customFieldDefs: fields.records,
    contacts: state.contacts.map(patchContact),
    deletedContacts: state.deletedContacts.map(patchContact),
    serviceReports: Object.fromEntries(
      Object.entries(state.serviceReports).map(([year, months]) => [
        year,
        Object.fromEntries(
          Object.entries(months).map(([month, entries]) => [
            month,
            entries.map(patchCategory),
          ])
        ),
      ])
    ),
    dayPlans: state.dayPlans.map(patchCategory),
    recurringPlans: state.recurringPlans.map(patchCategory),
  }
}
