import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { usePreferences, PREFERENCE_DEFAULTS } from '@/stores/preferences'
import { useTimeCache } from '@/stores/timeCache'
import { tracksTenure } from '@/lib/publisherCapabilities'
import type { TimeEntriesByYear } from '@/types/timeEntry'
import type {
  MappedImport,
  MappedPublisher,
} from '@/features/mytime-import/lib/mapMytimeData'

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

/**
 * Applies the imported Publisher role + Tenure Start Date per decision 4.
 * `setRole` owns the tenure-reset semantics, so it always runs before the
 * tenure write. In `'fillIfUnset'` mode a role still at its installed default
 * counts as unset (safe to fill), and a tenure is only filled when currently
 * `null` — so the Settings surface never clobbers a choice the user made, while
 * still topping up whatever they left blank.
 */
const applyPublisher = (
  publisher: MappedPublisher | null,
  mode: PublisherImportMode
): void => {
  if (!publisher) return

  const prefs = usePreferences.getState()
  const currentRole = prefs.role
  const currentTenure = prefs.tenureStartDate

  const roleIsUnset = currentRole === PREFERENCE_DEFAULTS.role
  let effectiveRole = currentRole
  if ((mode === 'overwrite' || roleIsUnset) && currentRole !== publisher.role) {
    prefs.setRole(publisher.role)
    effectiveRole = publisher.role
  }

  if (
    (mode === 'overwrite' || currentTenure == null) &&
    publisher.tenureStartDate &&
    tracksTenure(effectiveRole)
  ) {
    usePreferences
      .getState()
      .set({ tenureStartDate: publisher.tenureStartDate })
  }
}

/**
 * Persists a mapped MyTime backup into the WitnessWork Zustand stores. Every
 * record carries a deterministic `mytime-*` id, so a re-run is idempotent.
 */
export const writeMappedDataToStores = (
  mapped: MappedImport,
  opts: WriteMappedDataOptions
): void => {
  const contacts = useContacts.getState()
  const conversations = useConversations.getState()
  const serviceReport = useServiceReport.getState()
  const categories = useCategories.getState()

  for (const category of mapped.categories) categories.addCategory(category)
  if (mapped.customFieldDefs.length) {
    contacts.mergeIncomingCustomFieldDefs(mapped.customFieldDefs)
  }
  for (const contact of mapped.contacts) contacts.addContact(contact)
  for (const visit of mapped.visits) conversations.addConversation(visit)

  // `addServiceReport` appends unconditionally (no id dedup like the other
  // stores), so we must guard idempotency here — both against entries from a
  // prior import and duplicate ids within this batch.
  const seenEntryIds = existingServiceReportIds(serviceReport.serviceReports)
  for (const entry of mapped.timeEntries) {
    if (seenEntryIds.has(entry.id)) continue
    serviceReport.addServiceReport(entry)
    seenEntryIds.add(entry.id)
  }

  applyPublisher(mapped.publisher, opts.publisherMode)

  // Time totals are cached per month/year; drop it all so the imported entries
  // (and the synthesized monthly residuals) recompute.
  useTimeCache.getState().invalidateAllCache()
}
