import { syncNow } from '@/lib/syncClock'
import { translateSyncTimestamps } from '@/app/sync/clockSkew'
import {
  reconcileSyncDefinitions,
  expandDefinitionTombstones,
} from '@/app/sync/definitionReconciliation'
import { expireDeletedContactDetails } from '@/lib/contactRetention'
import { stripContactForTombstone } from '@/lib/dataProtection'
import { Contact } from '@/types/contact'
import { Visit, VisitTombstone } from '@/types/visit'
import {
  CustomFieldDefinition,
  CustomFieldTombstone,
} from '@/types/customField'
import { stripTombstonedCustomFields } from '@/lib/customFields'
import {
  DayPlan,
  PlanTombstone,
  TimeEntry,
  TimeEntriesByYear,
  TimeEntryTombstone,
} from '@/types/timeEntry'
import { Category, CategoryTombstone } from '@/types/category'
import { RecurringPlan } from '@/lib/serviceReport'
import { momentStoredDate } from '@/lib/normalizeDate'
import { mergePreferences } from '@/app/sync/preferencesMerge'
import { canonicalJson } from '@/lib/canonicalJson'
import {
  NON_SYNCABLE_PREFERENCE_KEYS,
  NON_SYNCABLE_PROFILE_KEYS,
} from '@/lib/syncPreferencePolicy'
import { SyncPayload } from '@/app/sync/payload'

/**
 * Outcome of a merge pass — lets the caller write exactly the fields that
 * changed into zustand via `set()` without touching the rest.
 */
export type MergeResult = {
  contacts: Contact[]
  deletedContacts: Contact[]
  customFieldDefs: CustomFieldDefinition[]
  deletedCustomFieldDefs: CustomFieldTombstone[]
  conversations: Visit[]
  deletedConversations: VisitTombstone[]
  serviceReports: TimeEntriesByYear
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  deletedServiceReports: TimeEntryTombstone[]
  deletedDayPlans: PlanTombstone[]
  deletedRecurringPlans: PlanTombstone[]
  categories: Category[]
  deletedCategories: CategoryTombstone[]
  preferencesValues: Record<string, unknown>
  preferenceUpdatedAt: Record<string, number>
  profileValues: Record<string, unknown>
  profileUpdatedAt: Record<string, number>
  /** True when any field above actually differs from local state. */
  changed: boolean
}

type LocalState = {
  contacts: Contact[]
  deletedContacts: Contact[]
  customFieldDefs: CustomFieldDefinition[]
  deletedCustomFieldDefs: CustomFieldTombstone[]
  conversations: Visit[]
  deletedConversations: VisitTombstone[]
  serviceReports: TimeEntriesByYear
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  deletedServiceReports: TimeEntryTombstone[]
  /** Absent means none (callers that predate Plan tombstones). */
  deletedDayPlans?: PlanTombstone[]
  /** Absent means none (callers that predate Plan tombstones). */
  deletedRecurringPlans?: PlanTombstone[]
  categories: Category[]
  deletedCategories: CategoryTombstone[]
  preferencesValues: Record<string, unknown>
  preferenceUpdatedAt: Record<string, number>
  profileValues: Record<string, unknown>
  profileUpdatedAt: Record<string, number>
}

/**
 * Merges a remote payload against local state by per-record `updatedAt`.
 *
 * Semantics:
 *
 * - **Both sides have the record**: keep the one with the larger `updatedAt`. A
 *   record without `updatedAt` is treated as older than any stamped record
 *   (covers pre-sync historical rows).
 * - **Remote-only**: insert locally.
 * - **Local-only**: keep local (it will propagate on the next push).
 * - **Tombstones**: a tombstone removes the record unless the record's
 *   `updatedAt` is strictly newer than its `deletedAt` (deletion wins a tie).
 *   Tombstones from either side propagate, newest `deletedAt` per id.
 *   Conversations, time entries, Day Plans, Recurring Plans, Categories, and
 *   custom field definitions carry them. Deleted contacts are records instead,
 *   and their redaction is one-way (see `mergeDeletedContacts`).
 * - **Preferences**: per-key last-writer-wins using `preferenceUpdatedAt`.
 */
export function mergePayload(
  localState: LocalState,
  remote: SyncPayload
): MergeResult {
  const now = syncNow()
  // Compared in full below, so a missing list must read as the empty one.
  const originalLocal = {
    ...localState,
    deletedDayPlans: localState.deletedDayPlans ?? [],
    deletedRecurringPlans: localState.deletedRecurringPlans ?? [],
  }
  const local = translateSyncTimestamps(originalLocal, 0, now + 5 * 60_000)
  remote = translateSyncTimestamps(remote, 0, now + 5 * 60_000)

  // --- Contacts (active) ---
  const { merged: mergedContacts } = mergeById(
    local.contacts,
    remote.contactStore.contacts as Contact[]
  )

  // --- Contacts (deleted) — tombstones also carry updatedAt. ---
  const mergedDeletedContacts = mergeDeletedContacts(
    local.deletedContacts,
    remote.contactStore.deletedContacts as Contact[]
  )

  // --- Custom field definitions ---
  // Merged by id with per-def updatedAt LWW. Permanent deletion carries an
  // explicit tombstone because a missing def otherwise looks like local-only
  // data and a stale peer would reintroduce it on the next merge.
  const remoteDefs = (remote.contactStore.customFieldDefs ??
    []) as CustomFieldDefinition[]
  const { merged: mergedDefs } = mergeById(local.customFieldDefs, remoteDefs)
  const mergedCustomFieldTombstones = expandDefinitionTombstones(
    [...local.customFieldDefs, ...remoteDefs],
    mergeTombstones(
      local.deletedCustomFieldDefs,
      remote.contactStore.deletedCustomFieldDefs ?? [],
      now
    )
  )
  const deletedCustomFieldIds = new Set(
    mergedCustomFieldTombstones.flatMap((tombstone) => [
      tombstone.id,
      ...(tombstone.legacyIds ?? []),
    ])
  )
  const customFieldDefsAfterTombstones = mergedDefs.filter(
    (def) => !deletedCustomFieldIds.has(def.id)
  )

  // Apply contact tombstones: if a contact exists both in the active list
  // and the deleted list, whichever has the larger updatedAt wins. Drop the
  // loser from the other side.
  const { activeFinal: contactsFinal, deletedFinal: deletedContactsFinal } =
    reconcileActiveAndDeletedContacts(mergedContacts, mergedDeletedContacts)

  // A stale contact payload can carry values for a definition deleted on this
  // device. Sanitize only after the contact LWW winner is selected so cleanup
  // cannot change active/deleted chronology and resurrect a contact.
  const sanitizedContactsFinal = contactsFinal.map((contact) =>
    stripTombstonedCustomFields(
      contact,
      mergedCustomFieldTombstones,
      contact.updatedAt
    )
  )
  const sanitizedDeletedContactsFinal = deletedContactsFinal.map((contact) =>
    stripTombstonedCustomFields(
      contact,
      mergedCustomFieldTombstones,
      contact.updatedAt
    )
  )
  // --- Conversations ---
  const { merged: mergedConversations } = mergeById(
    local.conversations,
    remote.conversationStore.conversations as Visit[]
  )
  const mergedConversationTombstones = mergeTombstones(
    local.deletedConversations,
    remote.conversationStore.deletedConversations ?? [],
    now
  )
  const conversationsAfterTombstones = applyTombstones(
    mergedConversations,
    mergedConversationTombstones
  )

  // --- Service reports (nested year → month → report[]) ---
  const { reports: mergedReports } = mergeServiceReports(
    local.serviceReports,
    remote.serviceReportStore.serviceReports
  )
  const mergedReportTombstones = mergeTombstones(
    local.deletedServiceReports,
    remote.serviceReportStore.deletedServiceReports ?? [],
    now
  )
  const reportsAfterTombstones = applyServiceReportTombstones(
    mergedReports,
    mergedReportTombstones
  )

  // --- Day plans / recurring plans (records + tombstones) ---
  // A Plan survives its tombstone only when edited after the deletion.
  // Payloads from builds before Plan tombstones carry none.
  const mergedDayPlanTombstones = mergeTombstones(
    local.deletedDayPlans,
    remote.serviceReportStore.deletedDayPlans ?? [],
    now
  )
  const dayPlansAfterTombstones = applyTombstones(
    mergeById(local.dayPlans, remote.serviceReportStore.dayPlans as DayPlan[])
      .merged,
    mergedDayPlanTombstones
  )
  const mergedRecurringPlanTombstones = mergeTombstones(
    local.deletedRecurringPlans,
    remote.serviceReportStore.deletedRecurringPlans ?? [],
    now
  )
  const recurringPlansAfterTombstones = applyTombstones(
    mergeById(
      local.recurringPlans,
      remote.serviceReportStore.recurringPlans as RecurringPlan[]
    ).merged,
    mergedRecurringPlanTombstones
  )

  // --- Categories (id-keyed records + tombstones, mirrors contacts) ---
  const remoteCategoryStore = remote.categoryStore ?? {
    categories: [] as Category[],
    deletedCategories: [] as CategoryTombstone[],
  }
  const { merged: mergedCategories } = mergeById(
    local.categories,
    (remoteCategoryStore.categories ?? []) as Category[]
  )
  const mergedCategoryTombstones = expandDefinitionTombstones(
    [...local.categories, ...remoteCategoryStore.categories],
    mergeTombstones(
      local.deletedCategories,
      remoteCategoryStore.deletedCategories ?? [],
      now
    )
  )
  const categoriesAfterTombstones = applyTombstones(
    mergedCategories,
    mergedCategoryTombstones
  )

  // --- Preferences ---
  const { values: mergedPrefValues, updatedAt: mergedPrefTimestamps } =
    mergePreferences(
      local.preferencesValues,
      local.preferenceUpdatedAt,
      remote.preferencesStore.values,
      remote.preferencesStore.updatedAt,
      NON_SYNCABLE_PREFERENCE_KEYS
    )

  // --- Profile (per-key LWW, mirrors preferences) ---
  // A pre-wave-3 peer payload won't carry `profileStore`; the legacy fields
  // have already been routed into a synthesized slice by
  // `normalizeLegacyPayloadFieldNames`. Defaulting here keeps the merge call
  // shape uniform either way.
  const remoteProfile = remote.profileStore ?? {
    values: {},
    updatedAt: {},
  }
  const { values: mergedProfileValues, updatedAt: mergedProfileTimestamps } =
    mergePreferences(
      local.profileValues,
      local.profileUpdatedAt,
      remoteProfile.values,
      remoteProfile.updatedAt,
      NON_SYNCABLE_PROFILE_KEYS
    )

  const result = reconcileSyncDefinitions({
    contacts: sanitizedContactsFinal,
    deletedContacts: expireDeletedContactDetails(
      sanitizedDeletedContactsFinal,
      now
    ),
    customFieldDefs: customFieldDefsAfterTombstones,
    deletedCustomFieldDefs: mergedCustomFieldTombstones,
    conversations: conversationsAfterTombstones,
    deletedConversations: mergedConversationTombstones,
    serviceReports: reportsAfterTombstones,
    dayPlans: dayPlansAfterTombstones,
    recurringPlans: recurringPlansAfterTombstones,
    deletedServiceReports: mergedReportTombstones,
    deletedDayPlans: mergedDayPlanTombstones,
    deletedRecurringPlans: mergedRecurringPlanTombstones,
    categories: categoriesAfterTombstones,
    deletedCategories: mergedCategoryTombstones,
    preferencesValues: mergedPrefValues,
    preferenceUpdatedAt: mergedPrefTimestamps,
    profileValues: mergedProfileValues,
    profileUpdatedAt: mergedProfileTimestamps,
  })
  // Judge the final state, after tombstones. A stale insertion filtered out in
  // this pass is not a change and must not trigger another push.
  const changed = Object.entries(result).some(
    ([key, value]) =>
      canonicalJson(value) !==
      canonicalJson(originalLocal[key as keyof typeof originalLocal])
  )
  return { ...result, changed }
}

// --- Helpers ---------------------------------------------------------------

type WithId = { id: string; updatedAt?: number; legacyIds?: string[] }

function recordKey(record: WithId): string {
  const value = { ...record } as Record<string, unknown>
  delete value.notifications
  delete value.dismissedNotificationId
  delete value.avatarMeta
  delete value.legacyIds
  const avatar = value.avatar as { type?: string; value?: string } | undefined
  if (avatar?.type === 'image') value.avatar = { ...avatar, value: 'image' }
  const followUp = value.followUp as Record<string, unknown> | undefined
  if (followUp) {
    const { notifications: _local, ...rest } = followUp
    value.followUp = rest
  }
  return canonicalJson(value)
}

function mergeById<T extends WithId>(
  local: T[],
  remote: T[]
): { merged: T[]; changed: boolean } {
  const byId = new Map<string, T>()
  for (const r of local) byId.set(r.id, r)

  let changed = false
  for (const r of remote) {
    let existing = byId.get(r.id)
    if (!existing) {
      byId.set(r.id, r)
      changed = true
      continue
    }
    const localTs = existing.updatedAt ?? 0
    const remoteTs = r.updatedAt ?? 0
    const aliases = [
      ...new Set([...(existing.legacyIds ?? []), ...(r.legacyIds ?? [])]),
    ]
      .filter((id) => id !== r.id)
      .sort()
    if (aliases.length) {
      existing = { ...existing, legacyIds: aliases }
      byId.set(r.id, existing)
    }
    if (
      remoteTs > localTs ||
      (remoteTs === localTs && recordKey(r) > recordKey(existing))
    ) {
      const before = existing as T & {
        avatar?: { type: string; value: string; revision?: string }
      }
      const after = r as T & {
        avatar?: { type: string; value: string; revision?: string }
      }
      const samePhoto =
        before.avatar?.type === 'image' &&
        after.avatar?.type === 'image' &&
        before.avatar.revision === after.avatar.revision &&
        before.avatar.value.startsWith('file://')
      const winner = samePhoto
        ? { ...r, avatar: { ...after.avatar, value: before.avatar!.value } }
        : r
      byId.set(
        r.id,
        aliases.length ? { ...winner, legacyIds: aliases } : winner
      )
      changed = true
    }
  }

  if (!changed && byId.size !== local.length) changed = true

  return { merged: Array.from(byId.values()), changed }
}

/**
 * Deleted contacts merge by `updatedAt` like other records, except that
 * redaction is one-way: a full archived copy loses to a redacted tombstone (a
 * permanent delete, data protection, or details expired after 90 days) whatever
 * the stamps. Otherwise a copy archived later on a device that was offline
 * would bring the householder's details back everywhere. The tombstone keeps
 * its own stamp, so the result doesn't depend on which file folds in first.
 *
 * Adding the contact again ends the redaction. `addContact` replaces the
 * tombstone and marks the copy `readdedAt`, which edits and a normal delete
 * keep. A full copy whose re-add is at least as new as the tombstone wins, so a
 * device that still holds the old tombstone can't redact the re-added contact
 * once it is archived again. A newer permanent delete redacts it again. Between
 * two full copies the more recent re-add wins before the stamps are compared:
 * the other copy predates a redaction this side has already seen past.
 *
 * Tombstones are rebuilt from id, stamp and aliases alone, so every device
 * lands on the same one. An active copy strictly newer than the tombstone still
 * wins later, in `reconcileActiveAndDeletedContacts`.
 */
function mergeDeletedContacts(local: Contact[], remote: Contact[]): Contact[] {
  const { merged } = mergeById(local, remote)
  const marked = (contact: Contact) =>
    contact.redacted || contact.readdedAt !== undefined
  if (!local.some(marked) && !remote.some(marked)) return merged
  const localById = new Map(local.map((contact) => [contact.id, contact]))
  const remoteById = new Map(remote.map((contact) => [contact.id, contact]))
  return merged.map((contact) => {
    const ours = localById.get(contact.id)
    const theirs = remoteById.get(contact.id)
    const kept =
      (ours && theirs && deletedContactSurvivor(ours, theirs)) || contact
    // Same pick as `mergeById`, whose copy also keeps this device's photo.
    if (!kept.redacted && recordKey(kept) === recordKey(contact)) return contact
    // `mergeById` collected both sides' aliases on its own pick.
    const { legacyIds } = contact as Contact & { legacyIds?: string[] }
    const result = kept.redacted
      ? stripContactForTombstone(kept, kept.updatedAt ?? 0)
      : kept
    return legacyIds?.length ? ({ ...result, legacyIds } as Contact) : result
  })
}

/**
 * The copy of one deleted contact that `mergeDeletedContacts` keeps, or
 * `undefined` when plain last-writer-wins (`mergeById`) decides.
 */
function deletedContactSurvivor(a: Contact, b: Contact): Contact | undefined {
  if (a.redacted && b.redacted) return undefined
  if (a.redacted || b.redacted) {
    const [tombstone, copy] = a.redacted ? [a, b] : [b, a]
    const readdedAt = copy.readdedAt ?? -1
    return readdedAt >= (tombstone.updatedAt ?? 0) ? copy : tombstone
  }
  const readdedA = a.readdedAt ?? -1
  const readdedB = b.readdedAt ?? -1
  if (readdedA === readdedB) return undefined
  return readdedA > readdedB ? a : b
}

function reconcileActiveAndDeletedContacts(
  active: Contact[],
  deleted: Contact[]
): { activeFinal: Contact[]; deletedFinal: Contact[] } {
  const deletedById = new Map(deleted.map((c) => [c.id, c]))
  const activeFinal: Contact[] = []
  const deletedFinal: Contact[] = [...deleted]

  for (const c of active) {
    const t = deletedById.get(c.id)
    if (!t) {
      activeFinal.push(c)
      continue
    }
    const activeTs = c.updatedAt ?? 0
    const deletedTs = t.updatedAt ?? 0
    if (activeTs > deletedTs) {
      // Resurrect: remove from deleted list.
      const idx = deletedFinal.findIndex((d) => d.id === c.id)
      if (idx >= 0) deletedFinal.splice(idx, 1)
      activeFinal.push(c)
    }
    // else: deletion wins, leave in deletedFinal and drop from active.
  }

  return { activeFinal, deletedFinal }
}

function mergeTombstones<T extends { id: string; deletedAt: number }>(
  local: T[],
  remote: T[],
  _now: number
): T[] {
  const byId = new Map<string, T>()
  for (const t of [...local, ...remote]) {
    const existing = byId.get(t.id)
    if (!existing) {
      byId.set(t.id, t)
      continue
    }
    const winner = t.deletedAt > existing.deletedAt ? t : existing
    const aliases = [
      ...new Set([
        ...((existing as T & { legacyIds?: string[] }).legacyIds ?? []),
        ...((t as T & { legacyIds?: string[] }).legacyIds ?? []),
      ]),
    ].sort()
    byId.set(t.id, aliases.length ? { ...winner, legacyIds: aliases } : winner)
  }
  // Deletion ids have no householder details. Keep evidence even when a
  // writer's clock is wrong or an old device reconnects much later.
  return Array.from(byId.values())
}

function applyTombstones<T extends WithId>(
  records: T[],
  tombstones: { id: string; deletedAt: number; legacyIds?: string[] }[]
): T[] {
  if (tombstones.length === 0) return records
  const tombsById = new Map<string, number>()
  for (const tombstone of tombstones)
    for (const id of [tombstone.id, ...(tombstone.legacyIds ?? [])])
      tombsById.set(id, Math.max(tombsById.get(id) ?? 0, tombstone.deletedAt))
  return records.filter((r) => {
    const deletedAt = tombsById.get(r.id)
    if (deletedAt === undefined) return true
    const ts = r.updatedAt ?? 0
    // Tombstone wins unless the record was updated strictly after it.
    return ts > deletedAt
  })
}

function mergeServiceReports(
  local: TimeEntriesByYear,
  remote: TimeEntriesByYear
): { reports: TimeEntriesByYear; changed: boolean } {
  // Flatten, merge by id, then rebuild the nested structure. O(n) total.
  const flatLocal: TimeEntry[] = []
  for (const year of Object.values(local)) {
    for (const month of Object.values(year)) {
      flatLocal.push(...month)
    }
  }
  const flatRemote: TimeEntry[] = []
  for (const year of Object.values(remote)) {
    for (const month of Object.values(year)) {
      flatRemote.push(...month)
    }
  }
  const { merged, changed } = mergeById(flatLocal, flatRemote)

  const rebuilt: TimeEntriesByYear = {}
  for (const r of merged) {
    const d = momentStoredDate(r.date)
    const year = d.year()
    const month = d.month()
    if (!rebuilt[year]) rebuilt[year] = {}
    if (!rebuilt[year][month]) rebuilt[year][month] = []
    rebuilt[year][month].push(r)
  }
  return { reports: rebuilt, changed }
}

function applyServiceReportTombstones(
  reports: TimeEntriesByYear,
  tombstones: TimeEntryTombstone[]
): TimeEntriesByYear {
  if (tombstones.length === 0) return reports
  const tombsById = new Map(tombstones.map((t) => [t.id, t]))
  const out: TimeEntriesByYear = {}
  for (const [yearKey, year] of Object.entries(reports)) {
    for (const [monthKey, month] of Object.entries(year)) {
      const kept = month.filter((r) => {
        const t = tombsById.get(r.id)
        if (!t) return true
        return (r.updatedAt ?? 0) > t.deletedAt
      })
      if (kept.length === 0) continue
      if (!out[yearKey]) out[yearKey] = {}
      out[yearKey][monthKey] = kept
    }
  }
  return out
}
