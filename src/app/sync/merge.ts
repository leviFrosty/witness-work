import { Contact } from '@/types/contact'
import { Visit, VisitTombstone } from '@/types/visit'
import { CustomFieldDefinition } from '@/types/customField'
import {
  DayPlan,
  TimeEntry,
  TimeEntriesByYear,
  TimeEntryTombstone,
} from '@/types/timeEntry'
import { Category, CategoryTombstone } from '@/types/category'
import { RecurringPlan } from '@/lib/serviceReport'
import { SyncPayload } from '@/app/sync/payload'
import { MileageData } from '@/types/mileage'
import { emptyMileageData } from '@/lib/mileagePersistence'

/**
 * Records older than this are dropped from tombstone arrays to keep them
 * bounded.
 */
const TOMBSTONE_RETENTION_MS = 1000 * 60 * 60 * 24 * 90 // 90 days

/**
 * Outcome of a merge pass — lets the caller write exactly the fields that
 * changed into zustand via `set()` without touching the rest.
 */
export type MergeResult = {
  mileage: MileageData
  contacts: Contact[]
  deletedContacts: Contact[]
  customFieldDefs: CustomFieldDefinition[]
  conversations: Visit[]
  deletedConversations: VisitTombstone[]
  serviceReports: TimeEntriesByYear
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  deletedServiceReports: TimeEntryTombstone[]
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
  mileage?: MileageData
  contacts: Contact[]
  deletedContacts: Contact[]
  customFieldDefs: CustomFieldDefinition[]
  conversations: Visit[]
  deletedConversations: VisitTombstone[]
  serviceReports: TimeEntriesByYear
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  deletedServiceReports: TimeEntryTombstone[]
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
 * - **Tombstones**: a tombstone with `deletedAt > record.updatedAt` removes the
 *   record. Tombstones from either side propagate.
 * - **Preferences**: per-key last-writer-wins using `preferenceUpdatedAt`.
 */
export function mergePayload(
  local: LocalState,
  remote: SyncPayload
): MergeResult {
  const now = Date.now()

  // --- Contacts (active) ---
  const { merged: mergedContacts, changed: contactsChanged } = mergeById(
    local.contacts,
    remote.contactStore.contacts as Contact[]
  )

  // --- Contacts (deleted) — tombstones also carry updatedAt. ---
  const { merged: mergedDeletedContacts, changed: deletedContactsChanged } =
    mergeById(
      local.deletedContacts,
      remote.contactStore.deletedContacts as Contact[]
    )

  // Apply contact tombstones: if a contact exists both in the active list
  // and the deleted list, whichever has the larger updatedAt wins. Drop the
  // loser from the other side.
  const { activeFinal: contactsFinal, deletedFinal: deletedContactsFinal } =
    reconcileActiveAndDeletedContacts(mergedContacts, mergedDeletedContacts)

  // --- Custom field definitions ---
  // Merged by id with per-def updatedAt LWW. Hard-deletion produces a
  // tombstone via the def disappearing from one side; we don't track that
  // separately because archive is the user-facing delete, and an archived
  // def with a newer updatedAt naturally wins over an active one.
  const remoteDefs = (remote.contactStore.customFieldDefs ??
    []) as CustomFieldDefinition[]
  const { merged: mergedDefs, changed: defsChanged } = mergeById(
    local.customFieldDefs,
    remoteDefs
  )

  // --- Conversations ---
  const { merged: mergedConversations, changed: conversationsChanged } =
    mergeById(
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
  const { reports: mergedReports, changed: reportsChanged } =
    mergeServiceReports(
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

  // --- Day plans / recurring plans (no tombstones in v1) ---
  const { merged: mergedDayPlans, changed: dayPlansChanged } = mergeById(
    local.dayPlans,
    remote.serviceReportStore.dayPlans as DayPlan[]
  )
  const { merged: mergedRecurringPlans, changed: recurringPlansChanged } =
    mergeById(
      local.recurringPlans,
      remote.serviceReportStore.recurringPlans as RecurringPlan[]
    )

  // --- Categories (id-keyed records + tombstones, mirrors contacts) ---
  const remoteCategoryStore = remote.categoryStore ?? {
    categories: [] as Category[],
    deletedCategories: [] as CategoryTombstone[],
  }
  const { merged: mergedCategories, changed: categoriesChanged } = mergeById(
    local.categories,
    (remoteCategoryStore.categories ?? []) as Category[]
  )
  const mergedCategoryTombstones = mergeTombstones(
    local.deletedCategories,
    remoteCategoryStore.deletedCategories ?? [],
    now
  )
  const categoriesAfterTombstones = applyTombstones(
    mergedCategories,
    mergedCategoryTombstones
  )

  const mileage = mergeMileageData(local.mileage, remote.mileageStore, now)

  // --- Preferences ---
  const {
    values: mergedPrefValues,
    updatedAt: mergedPrefTimestamps,
    changed: prefsChanged,
  } = mergePreferences(
    local.preferencesValues,
    local.preferenceUpdatedAt,
    remote.preferencesStore.values,
    remote.preferencesStore.updatedAt
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
  const {
    values: mergedProfileValues,
    updatedAt: mergedProfileTimestamps,
    changed: profileChanged,
  } = mergePreferences(
    local.profileValues,
    local.profileUpdatedAt,
    remoteProfile.values,
    remoteProfile.updatedAt
  )

  const changed =
    mileage.changed ||
    contactsChanged ||
    deletedContactsChanged ||
    defsChanged ||
    conversationsChanged ||
    reportsChanged ||
    dayPlansChanged ||
    recurringPlansChanged ||
    categoriesChanged ||
    prefsChanged ||
    profileChanged ||
    mergedConversationTombstones.length !== local.deletedConversations.length ||
    mergedReportTombstones.length !== local.deletedServiceReports.length ||
    mergedCategoryTombstones.length !== local.deletedCategories.length

  return {
    mileage: mileage.data,
    contacts: contactsFinal,
    deletedContacts: deletedContactsFinal,
    customFieldDefs: mergedDefs,
    conversations: conversationsAfterTombstones,
    deletedConversations: mergedConversationTombstones,
    serviceReports: reportsAfterTombstones,
    dayPlans: mergedDayPlans,
    recurringPlans: mergedRecurringPlans,
    deletedServiceReports: mergedReportTombstones,
    categories: categoriesAfterTombstones,
    deletedCategories: mergedCategoryTombstones,
    preferencesValues: mergedPrefValues,
    preferenceUpdatedAt: mergedPrefTimestamps,
    profileValues: mergedProfileValues,
    profileUpdatedAt: mergedProfileTimestamps,
    changed,
  }
}

// --- Helpers ---------------------------------------------------------------

type WithId = { id: string; updatedAt?: number }

/** Merge all three mileage record families together so references stay intact. */
export function mergeMileageData(
  local: MileageData = emptyMileageData(),
  remote: MileageData = emptyMileageData(),
  now = Date.now()
): { data: MileageData; changed: boolean } {
  // Per-device files can remain stale indefinitely. Preserve mileage deletion
  // markers until a safe peer watermark exists, or old trips can reappear.
  const deletedEntries = mergeTombstones(
    local.deletedEntries,
    remote.deletedEntries,
    now,
    Infinity
  )
  const deletedVehicles = mergeTombstones(
    local.deletedVehicles,
    remote.deletedVehicles,
    now,
    Infinity
  )
  const deletedCategories = mergeTombstones(
    local.deletedCategories,
    remote.deletedCategories,
    now,
    Infinity
  )
  const entries = applyTombstones(
    mergeById(local.entries, remote.entries).merged,
    deletedEntries
  )
  const vehicleIds = new Set(entries.map((entry) => entry.vehicleId))
  const categoryIds = new Set(
    entries.flatMap((entry) => (entry.categoryId ? [entry.categoryId] : []))
  )
  const vehicles = retainReferencedRecords(
    mergeById(local.vehicles, remote.vehicles).merged,
    deletedVehicles,
    vehicleIds
  )
  const categories = retainReferencedRecords(
    mergeById(local.categories, remote.categories).merged,
    deletedCategories,
    categoryIds
  )
  const data = {
    vehicles,
    categories,
    entries,
    deletedVehicles,
    deletedCategories,
    deletedEntries,
  }
  // Timestamps inside a tombstone can change without its array length changing.
  const changed = (Object.keys(data) as (keyof MileageData)[]).some((key) => {
    const previous = new Map(local[key].map((item) => [item.id, item]))
    return (
      previous.size !== data[key].length ||
      data[key].some((item) => {
        const before = previous.get(item.id)
        if (!before) return true
        return 'deletedAt' in item
          ? !('deletedAt' in before) || before.deletedAt !== item.deletedAt
          : before !== item
      })
    )
  })
  return { data, changed }
}

function retainReferencedRecords<
  T extends { id: string; updatedAt: number; archivedAt?: number },
>(
  records: T[],
  tombstones: { id: string; deletedAt: number }[],
  references: Set<string>
): T[] {
  const deleted = new Map(tombstones.map((item) => [item.id, item.deletedAt]))
  return records.flatMap((record) => {
    const deletedAt = deleted.get(record.id)
    if (deletedAt === undefined || record.updatedAt > deletedAt) return [record]
    if (!references.has(record.id)) return []
    // A peer created an entry while this record was being deleted elsewhere.
    // Retain it as archived, with a deterministic stamp newer than the deletion.
    return [
      {
        ...record,
        archivedAt: record.archivedAt ?? deletedAt,
        updatedAt: deletedAt + 1,
      },
    ]
  })
}

function mergeById<T extends WithId>(
  local: T[],
  remote: T[]
): { merged: T[]; changed: boolean } {
  const byId = new Map<string, T>()
  for (const r of local) byId.set(r.id, r)

  let changed = false
  for (const r of remote) {
    const existing = byId.get(r.id)
    if (!existing) {
      byId.set(r.id, r)
      changed = true
      continue
    }
    const localTs = existing.updatedAt ?? 0
    const remoteTs = r.updatedAt ?? 0
    if (remoteTs > localTs) {
      byId.set(r.id, r)
      changed = true
    }
  }

  if (!changed && byId.size !== local.length) changed = true

  return { merged: Array.from(byId.values()), changed }
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
  now: number,
  retentionMs = TOMBSTONE_RETENTION_MS
): T[] {
  const byId = new Map<string, T>()
  for (const t of [...local, ...remote]) {
    const existing = byId.get(t.id)
    if (!existing || t.deletedAt > existing.deletedAt) {
      byId.set(t.id, t)
    }
  }
  const cutoff = now - retentionMs
  return Array.from(byId.values()).filter((t) => t.deletedAt >= cutoff)
}

function applyTombstones<T extends WithId>(
  records: T[],
  tombstones: { id: string; deletedAt: number }[]
): T[] {
  if (tombstones.length === 0) return records
  const tombsById = new Map(tombstones.map((t) => [t.id, t]))
  return records.filter((r) => {
    const t = tombsById.get(r.id)
    if (!t) return true
    const ts = r.updatedAt ?? 0
    // Tombstone wins unless the record was updated strictly after it.
    return ts > t.deletedAt
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
    const d = new Date(r.date)
    const year = d.getFullYear()
    const month = d.getMonth()
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

function mergePreferences(
  localValues: Record<string, unknown>,
  localUpdatedAt: Record<string, number>,
  remoteValues: Record<string, unknown>,
  remoteUpdatedAt: Record<string, number>
): {
  values: Record<string, unknown>
  updatedAt: Record<string, number>
  changed: boolean
} {
  const values = { ...localValues }
  const updatedAt = { ...localUpdatedAt }
  let changed = false

  // Union of keys from both sides.
  const keys = new Set<string>([
    ...Object.keys(remoteValues ?? {}),
    ...Object.keys(remoteUpdatedAt ?? {}),
  ])

  for (const key of keys) {
    const localTs = localUpdatedAt?.[key] ?? 0
    const remoteTs = remoteUpdatedAt?.[key] ?? 0
    if (remoteTs > localTs) {
      values[key] = remoteValues[key]
      updatedAt[key] = remoteTs
      changed = true
    }
  }

  return { values, updatedAt, changed }
}
