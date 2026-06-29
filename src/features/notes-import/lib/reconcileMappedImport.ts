import type { MappedImport } from '@/lib/import/types'
import type { MappedWarning } from '@/features/notes-import/lib/mapNotesImport'
import type { Contact } from '@/types/contact'
import type { Category } from '@/types/category'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'

/**
 * Reconcile (ADR 0010). The model dedupes an import's NEW contacts/categories
 * against an `existingContacts`/`existingCategories` snapshot frozen at
 * kickoff. Under multi-import a user can kick off import B before accepting
 * import A, so B's snapshot is blind to the records A created — committing B
 * would insert a duplicate of the same householder.
 *
 * This pass runs **at Accept time** against the user's CURRENT local data: a
 * NEW contact/category whose normalized name uniquely matches an existing
 * record is re-pointed onto that record (its referencing visits/time entries
 * follow) and dropped from the insert set, so no duplicate is created. A
 * genuinely ambiguous match (two existing records share the name) fails safe —
 * imported as new, with a warning for the user to resolve, never auto-merging
 * two distinct people.
 *
 * Pure: it takes a snapshot of current store data and returns a re-pointed
 * {@link MappedImport} plus any ambiguity warnings. It never adds a re-pointed
 * EXISTING id to the insert set, so the downstream commit record (and therefore
 * Undo) still lists only genuinely-new insertions.
 */

export interface ReconcileSnapshot {
  contacts: Pick<Contact, 'id' | 'name'>[]
  categories: Pick<Category, 'id' | 'name'>[]
}

export interface ReconcileMessages {
  ambiguousContact: (name: string) => string
  ambiguousCategory: (name: string) => string
}

export interface ReconcileResult {
  mapped: MappedImport
  /** Ambiguity warnings to merge into the preview's warnings. */
  warnings: MappedWarning[]
}

/** Trim, lowercase, and collapse internal whitespace for exact name matching. */
export const normalizeReconcileName = (name: string): string =>
  name.trim().toLowerCase().replace(/\s+/g, ' ')

const DEFAULT_MESSAGES: ReconcileMessages = {
  ambiguousContact: (name) =>
    `More than one existing contact is named “${name}”. Imported as a new contact — merge it manually if it’s the same person.`,
  ambiguousCategory: (name) =>
    `More than one existing category is named “${name}”. Imported as a new category.`,
}

/** Normalized name → list of existing store ids that carry it. */
const indexByName = (
  records: { id: string; name: string }[]
): Map<string, string[]> => {
  const byName = new Map<string, string[]>()
  for (const r of records) {
    const n = normalizeReconcileName(r.name)
    if (!n) continue
    const list = byName.get(n)
    if (list) list.push(r.id)
    else byName.set(n, [r.id])
  }
  return byName
}

type WarningKind = NonNullable<MappedWarning['target']>['kind']

/**
 * Re-points a set of NEW records onto uniquely-named existing records: a unique
 * name match drops the record from the insert set and records the remap; an
 * ambiguous match (two existing records share the name) keeps it and raises a
 * warning. `skip` opts a record out of matching entirely (e.g. the shared LDC
 * builtin, already deduped by id).
 */
const reconcileRecords = <T extends { id: string; name: string }>(
  records: T[],
  snapshot: { id: string; name: string }[],
  opts: {
    skip?: (record: T) => boolean
    warningKind: WarningKind
    warningIdPrefix: string
    ambiguousMessage: (name: string) => string
  }
): { kept: T[]; remap: Map<string, string>; warnings: MappedWarning[] } => {
  const byName = indexByName(snapshot)
  const remap = new Map<string, string>() // mapped id → existing id
  const kept: T[] = []
  const warnings: MappedWarning[] = []
  for (const r of records) {
    if (opts.skip?.(r)) {
      kept.push(r)
      continue
    }
    const matches = (byName.get(normalizeReconcileName(r.name)) ?? []).filter(
      (id) => id !== r.id
    )
    if (matches.length === 1) {
      remap.set(r.id, matches[0]) // attach to existing — don't insert
      continue
    }
    kept.push(r)
    if (matches.length > 1) {
      warnings.push({
        id: `${opts.warningIdPrefix}${r.id}`,
        severity: 'warning',
        message: opts.ambiguousMessage(r.name),
        target: { kind: opts.warningKind, id: r.id },
      })
    }
  }
  return { kept, remap, warnings }
}

export const reconcileMappedImport = (
  mapped: MappedImport,
  snapshot: ReconcileSnapshot,
  messages: ReconcileMessages = DEFAULT_MESSAGES
): ReconcileResult => {
  // --- Contacts ---
  const {
    kept: keptContacts,
    remap: contactRemap,
    warnings: contactWarnings,
  } = reconcileRecords(mapped.contacts, snapshot.contacts, {
    warningKind: 'contact',
    warningIdPrefix: 'reconcile-c-',
    ambiguousMessage: messages.ambiguousContact,
  })

  // --- Categories (the shared LDC builtin already dedupes by id — leave it) ---
  const {
    kept: keptCategories,
    remap: categoryRemap,
    warnings: categoryWarnings,
  } = reconcileRecords(mapped.categories, snapshot.categories, {
    skip: (c) => c.id === LDC_BUILTIN_CATEGORY_ID,
    warningKind: 'category',
    warningIdPrefix: 'reconcile-cat-',
    ambiguousMessage: messages.ambiguousCategory,
  })

  const warnings: MappedWarning[] = [...contactWarnings, ...categoryWarnings]

  // --- Re-point references onto the matched existing records ---
  const visits = contactRemap.size
    ? mapped.visits.map((v) =>
        contactRemap.has(v.contact.id)
          ? {
              ...v,
              contact: { ...v.contact, id: contactRemap.get(v.contact.id)! },
            }
          : v
      )
    : mapped.visits

  const timeEntries = categoryRemap.size
    ? mapped.timeEntries.map((t) =>
        t.categoryId && categoryRemap.has(t.categoryId)
          ? { ...t, categoryId: categoryRemap.get(t.categoryId)! }
          : t
      )
    : mapped.timeEntries

  return {
    mapped: {
      ...mapped,
      contacts: keptContacts,
      categories: keptCategories,
      visits,
      timeEntries,
    },
    warnings,
  }
}
