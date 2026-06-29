import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { usePreferences, PREFERENCE_DEFAULTS } from '@/stores/preferences'
import { useTimeCache } from '@/stores/timeCache'
import { tracksTenure } from '@/lib/publisherCapabilities'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import type { TimeEntriesByYear, TimeEntry } from '@/types/timeEntry'
import type { Publisher } from '@/types/publisher'
import type { MappedImport, MappedPublisher } from '@/lib/import/types'

/** Flattens every TimeEntry id already in the service-report store. */
const existingServiceReportIds = (reports: TimeEntriesByYear): Set<string> => {
  const ids = new Set<string>()
  for (const year of Object.values(reports)) {
    for (const month of Object.values(year)) {
      for (const r of month) ids.add(r.id)
    }
  }
  return ids
}

/**
 * How the import should treat the user's Publisher role + Tenure Start Date:
 *
 * - `'overwrite'` — onboarding, a fresh user; always apply the imported values.
 * - `'fillIfUnset'` — Settings; only fill a pristine profile, never clobber a
 *   role or tenure the user already chose (decision 4).
 */
export type PublisherImportMode = 'overwrite' | 'fillIfUnset'

export interface WriteMappedDataOptions {
  publisherMode: PublisherImportMode
}

/** The prior publisher state captured so an undo can restore it. */
export interface PublisherUndo {
  prevRole: Publisher
  prevTenure: Date | null
}

/**
 * Exactly what a single {@link writeMappedDataToStores} call NEW-inserted, so an
 * undo can delete precisely that set (and nothing the user already had).
 * Records the import skipped as already-present are intentionally absent here.
 */
export interface ImportCommitResult {
  insertedContactIds: string[]
  insertedVisitIds: string[]
  /**
   * Stored (date-normalized) TimeEntry objects, so undo can locate + delete
   * them.
   */
  insertedTimeEntries: TimeEntry[]
  insertedCategoryIds: string[]
  insertedCustomFieldDefIds: string[]
  publisherChange: PublisherUndo | null
}

/**
 * Applies the imported Publisher role + Tenure Start Date per decision 4 and
 * returns the prior state if it changed anything (for undo). `setRole` owns the
 * tenure-reset semantics, so it always runs before the tenure write.
 */
const applyPublisher = (
  publisher: MappedPublisher | null,
  mode: PublisherImportMode
): PublisherUndo | null => {
  if (!publisher) return null

  const prefs = usePreferences.getState()
  const prevRole = prefs.role
  const prevTenure = prefs.tenureStartDate
  let changed = false

  const roleIsUnset = prevRole === PREFERENCE_DEFAULTS.role
  let effectiveRole = prevRole
  if ((mode === 'overwrite' || roleIsUnset) && prevRole !== publisher.role) {
    prefs.setRole(publisher.role)
    effectiveRole = publisher.role
    changed = true
  }

  if (
    (mode === 'overwrite' || prevTenure == null) &&
    publisher.tenureStartDate &&
    tracksTenure(effectiveRole)
  ) {
    usePreferences
      .getState()
      .set({ tenureStartDate: publisher.tenureStartDate })
    changed = true
  }

  return changed ? { prevRole, prevTenure } : null
}

/**
 * Persists a mapped import into the WitnessWork Zustand stores. Every record
 * carries a deterministic id, so a re-run is idempotent. Returns the set of ids
 * it NEW-inserted (and the prior publisher state) so the caller can offer an
 * exact undo.
 *
 * Shared by every import source (MyTime, Notes).
 */
export const writeMappedDataToStores = (
  mapped: MappedImport,
  opts: WriteMappedDataOptions
): ImportCommitResult => {
  const contacts = useContacts.getState()
  const conversations = useConversations.getState()
  const serviceReport = useServiceReport.getState()
  const categories = useCategories.getState()

  // Categories (addCategory skips existing ids; mirror that to track insertions).
  const existingCategoryIds = new Set(categories.categories.map((c) => c.id))
  const insertedCategoryIds: string[] = []
  for (const category of mapped.categories) {
    if (existingCategoryIds.has(category.id)) continue
    categories.addCategory(category)
    existingCategoryIds.add(category.id)
    insertedCategoryIds.push(category.id)
  }

  // Custom field defs: mergeIncomingCustomFieldDefs adds only unknown ids.
  const existingDefIds = new Set(contacts.customFieldDefs.map((d) => d.id))
  const insertedCustomFieldDefIds = mapped.customFieldDefs
    .filter((d) => !existingDefIds.has(d.id))
    .map((d) => d.id)
  if (mapped.customFieldDefs.length) {
    contacts.mergeIncomingCustomFieldDefs(mapped.customFieldDefs)
  }

  // Contacts (addContact skips ids present in contacts OR deletedContacts).
  const existingContactIds = new Set(
    [...contacts.contacts, ...contacts.deletedContacts].map((c) => c.id)
  )
  const insertedContactIds: string[] = []
  for (const contact of mapped.contacts) {
    if (existingContactIds.has(contact.id)) continue
    contacts.addContact(contact)
    existingContactIds.add(contact.id)
    insertedContactIds.push(contact.id)
  }

  // Visits (addConversation skips existing ids).
  const existingVisitIds = new Set(conversations.conversations.map((v) => v.id))
  const insertedVisitIds: string[] = []
  for (const visit of mapped.visits) {
    if (existingVisitIds.has(visit.id)) continue
    conversations.addConversation(visit)
    existingVisitIds.add(visit.id)
    insertedVisitIds.push(visit.id)
  }

  // `addServiceReport` appends unconditionally (no id dedup), so we guard
  // idempotency here — against prior imports and dupes within this batch. We
  // record the STORED (date-normalized) entry so undo's `deleteServiceReport`
  // resolves the same month/year bucket.
  const seenEntryIds = existingServiceReportIds(serviceReport.serviceReports)
  const insertedTimeEntries: TimeEntry[] = []
  for (const entry of mapped.timeEntries) {
    if (seenEntryIds.has(entry.id)) continue
    serviceReport.addServiceReport(entry)
    seenEntryIds.add(entry.id)
    insertedTimeEntries.push({
      ...entry,
      date: normalizeDateForStorage(entry.date),
    })
  }

  const publisherChange = applyPublisher(mapped.publisher, opts.publisherMode)

  // Time totals are cached per month/year; drop it all so the imported entries
  // recompute.
  useTimeCache.getState().invalidateAllCache()

  return {
    insertedContactIds,
    insertedVisitIds,
    insertedTimeEntries,
    insertedCategoryIds,
    insertedCustomFieldDefIds,
    publisherChange,
  }
}

/**
 * Reverses a {@link writeMappedDataToStores} commit: deletes exactly the records
 * it inserted and restores the prior Publisher role + tenure. Safe to call once
 * per commit. A builtin Category (LDC) the import seeded cannot be deleted (the
 * store hard-blocks it) and is intentionally left in place — it is shared
 * infra, not user data.
 */
export const undoImport = (commit: ImportCommitResult): void => {
  const contacts = useContacts.getState()
  const conversations = useConversations.getState()
  const serviceReport = useServiceReport.getState()
  const categories = useCategories.getState()

  for (const id of commit.insertedContactIds) {
    contacts.deleteContact(id)
    // Purge from the recycle bin too, so an undone import leaves no trace.
    contacts.removeDeletedContact(id)
  }
  for (const id of commit.insertedVisitIds) conversations.deleteConversation(id)
  for (const entry of commit.insertedTimeEntries) {
    serviceReport.deleteServiceReport(entry)
  }
  for (const id of commit.insertedCategoryIds) categories.deleteCategory(id)
  for (const id of commit.insertedCustomFieldDefIds) {
    contacts.purgeCustomFieldDef(id)
  }

  if (commit.publisherChange) {
    const prefs = usePreferences.getState()
    prefs.setRole(commit.publisherChange.prevRole)
    usePreferences
      .getState()
      .set({ tenureStartDate: commit.publisherChange.prevTenure })
  }

  useTimeCache.getState().invalidateAllCache()
}
