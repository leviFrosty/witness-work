import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { usePreferences, PREFERENCE_DEFAULTS } from '@/stores/preferences'
import { tracksTenure } from '@/lib/publisherCapabilities'
import { calendarMonthOf, type RoleHistory } from '@/lib/roleHistory'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import { isRedactedContactTombstone } from '@/lib/dataProtection'
import { deleteAvatarFiles } from '@/lib/contactAvatarFiles'
import type { TimeEntriesByYear, TimeEntry } from '@/types/timeEntry'
import type { Publisher } from '@/types/publisher'
import type { MappedImport, MappedPublisher } from '@/lib/import/types'

const userDeletedIds = (
  tombstones: { id: string; importUndone?: true }[]
): string[] =>
  tombstones.filter((t) => !t.importUndone).map((tombstone) => tombstone.id)

const markImportUndone = <T extends { id: string; importUndone?: true }>(
  tombstones: T[],
  ids: Set<string>
): T[] =>
  tombstones.map((tombstone) =>
    ids.has(tombstone.id) ? { ...tombstone, importUndone: true } : tombstone
  )

const existingServiceReportIds = (reports: TimeEntriesByYear): Set<string> => {
  const ids = new Set<string>()
  for (const year of Object.values(reports)) {
    for (const month of Object.values(year)) {
      for (const r of month) ids.add(r.id)
    }
  }
  return ids
}

export type PublisherImportMode = 'overwrite' | 'fillIfUnset'

export interface WriteMappedDataOptions {
  publisherMode: PublisherImportMode
}

export interface PublisherUndo {
  prevRole: Publisher
  prevTenure: Date | null
  prevRoleHistory: RoleHistory | null
}

export interface ImportCommitResult {
  insertedContactIds: string[]
  insertedVisitIds: string[]

  insertedTimeEntries: TimeEntry[]
  insertedCategoryIds: string[]
  insertedCustomFieldDefIds: string[]
  publisherChange: PublisherUndo | null
}

const applyPublisher = (
  publisher: MappedPublisher | null,
  mode: PublisherImportMode
): PublisherUndo | null => {
  if (!publisher) return null

  const prefs = usePreferences.getState()
  const prevRole = prefs.role
  const prevTenure = prefs.tenureStartDate
  const prevRoleHistory = prefs.roleHistory
  let changed = false

  const roleIsUnset = prevRole === PREFERENCE_DEFAULTS.role
  let effectiveRole = prevRole
  if ((mode === 'overwrite' || roleIsUnset) && prevRole !== publisher.role) {
    prefs.setRole(
      publisher.role,
      prevRoleHistory ? { from: calendarMonthOf() } : undefined
    )
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

  return changed ? { prevRole, prevTenure, prevRoleHistory } : null
}

export const writeMappedDataToStores = (
  mapped: MappedImport,
  opts: WriteMappedDataOptions
): ImportCommitResult => {
  const contacts = useContacts.getState()
  const conversations = useConversations.getState()
  const serviceReport = useServiceReport.getState()
  const categories = useCategories.getState()

  const existingCategoryIds = new Set(categories.categories.map((c) => c.id))
  const insertedCategoryIds: string[] = []
  for (const category of mapped.categories) {
    if (existingCategoryIds.has(category.id)) continue
    categories.addCategory(category)
    existingCategoryIds.add(category.id)
    insertedCategoryIds.push(category.id)
  }

  const existingDefIds = new Set(contacts.customFieldDefs.map((d) => d.id))
  if (mapped.customFieldDefs.length) {
    contacts.mergeIncomingCustomFieldDefs(mapped.customFieldDefs)
  }

  const insertedCustomFieldDefIds = useContacts
    .getState()
    .customFieldDefs.filter(
      (d) =>
        !existingDefIds.has(d.id) &&
        mapped.customFieldDefs.some((incoming) => incoming.id === d.id)
    )
    .map((d) => d.id)

  const existingContactIds = new Set(
    [
      ...contacts.contacts,
      ...contacts.deletedContacts.filter((c) => !isRedactedContactTombstone(c)),
    ].map((c) => c.id)
  )

  const contactsToAdd = mapped.contacts.filter((contact) => {
    if (existingContactIds.has(contact.id)) return false
    existingContactIds.add(contact.id)
    return true
  })
  if (contactsToAdd.length) contacts.addContacts(contactsToAdd)
  const insertedContactIds = contactsToAdd.map((c) => c.id)

  const existingVisitIds = new Set([
    ...conversations.conversations.map((v) => v.id),
    ...userDeletedIds(conversations.deletedConversations),
  ])
  const visitsToAdd = mapped.visits.filter((visit) => {
    if (existingVisitIds.has(visit.id)) return false
    existingVisitIds.add(visit.id)
    return true
  })
  if (visitsToAdd.length) conversations.addConversations(visitsToAdd)
  const insertedVisitIds = visitsToAdd.map((v) => v.id)

  const seenEntryIds = existingServiceReportIds(serviceReport.serviceReports)
  for (const id of userDeletedIds(serviceReport.deletedServiceReports))
    seenEntryIds.add(id)
  const entriesToAdd = mapped.timeEntries.filter((entry) => {
    if (seenEntryIds.has(entry.id)) return false
    seenEntryIds.add(entry.id)
    return true
  })
  if (entriesToAdd.length) serviceReport.addServiceReports(entriesToAdd)
  const insertedTimeEntries: TimeEntry[] = entriesToAdd.map((entry) => ({
    ...entry,
    date: normalizeDateForStorage(entry.date),
  }))

  const publisherChange = applyPublisher(mapped.publisher, opts.publisherMode)

  usePreferences.getState().set({ badgesBackfilledAt: null })

  return {
    insertedContactIds,
    insertedVisitIds,
    insertedTimeEntries,
    insertedCategoryIds,
    insertedCustomFieldDefIds,
    publisherChange,
  }
}

export const undoImport = (commit: ImportCommitResult): void => {
  const contacts = useContacts.getState()
  const conversations = useConversations.getState()
  const serviceReport = useServiceReport.getState()
  const categories = useCategories.getState()

  const ownVisitIds = new Set(commit.insertedVisitIds)
  const externallyReferencedContactIds = new Set<string>()
  for (const v of conversations.conversations) {
    if (ownVisitIds.has(v.id)) continue
    externallyReferencedContactIds.add(v.contact.id)
  }

  const ownTimeEntryIds = new Set(commit.insertedTimeEntries.map((e) => e.id))
  const externallyReferencedCategoryIds = new Set<string>()
  for (const year of Object.values(serviceReport.serviceReports)) {
    for (const month of Object.values(year)) {
      for (const entry of month) {
        if (ownTimeEntryIds.has(entry.id)) continue
        if (entry.categoryId)
          externallyReferencedCategoryIds.add(entry.categoryId)
      }
    }
  }

  for (const id of commit.insertedContactIds) {
    if (externallyReferencedContactIds.has(id)) continue
    contacts.deleteContact(id)

    contacts.removeDeletedContact(id)
    void deleteAvatarFiles(id)
  }

  const liveVisitIds = new Set(conversations.conversations.map((v) => v.id))
  const undoneVisitIds = new Set(
    commit.insertedVisitIds.filter((id) => liveVisitIds.has(id))
  )
  for (const id of undoneVisitIds) conversations.deleteConversation(id)
  useConversations.setState(({ deletedConversations }) => ({
    deletedConversations: markImportUndone(
      deletedConversations,
      undoneVisitIds
    ),
  }))
  const liveEntryIds = existingServiceReportIds(serviceReport.serviceReports)
  const undoneEntryIds = new Set(
    commit.insertedTimeEntries
      .map((entry) => entry.id)
      .filter((id) => liveEntryIds.has(id))
  )
  for (const entry of commit.insertedTimeEntries) {
    if (undoneEntryIds.has(entry.id)) serviceReport.deleteServiceReport(entry)
  }
  useServiceReport.setState(({ deletedServiceReports }) => ({
    deletedServiceReports: markImportUndone(
      deletedServiceReports,
      undoneEntryIds
    ),
  }))
  for (const id of commit.insertedCategoryIds) {
    if (externallyReferencedCategoryIds.has(id)) continue
    categories.deleteCategory(id)
  }
  for (const id of commit.insertedCustomFieldDefIds) {
    contacts.removeCustomFieldDefForUndo(id)
  }

  if (commit.publisherChange) {
    usePreferences.getState().set({
      role: commit.publisherChange.prevRole,
      roleHistory: commit.publisherChange.prevRoleHistory ?? null,
      tenureStartDate: commit.publisherChange.prevTenure,
    })
  }
}
