import { Contact } from '../../types/contact'
import { Conversation, ConversationTombstone } from '../../types/conversation'
import { CustomFieldDefinition } from '../../types/customField'
import {
  DayPlan,
  ServiceReport,
  ServiceReportsByYears,
  ServiceReportTombstone,
} from '../../types/serviceReport'
import { RecurringPlan } from '../serviceReport'
import { SyncPayload } from './payload'

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
  contacts: Contact[]
  deletedContacts: Contact[]
  customFieldDefs: CustomFieldDefinition[]
  conversations: Conversation[]
  deletedConversations: ConversationTombstone[]
  serviceReports: ServiceReportsByYears
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  deletedServiceReports: ServiceReportTombstone[]
  preferencesValues: Record<string, unknown>
  preferenceUpdatedAt: Record<string, number>
  /** True when any field above actually differs from local state. */
  changed: boolean
}

type LocalState = {
  contacts: Contact[]
  deletedContacts: Contact[]
  customFieldDefs: CustomFieldDefinition[]
  conversations: Conversation[]
  deletedConversations: ConversationTombstone[]
  serviceReports: ServiceReportsByYears
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  deletedServiceReports: ServiceReportTombstone[]
  preferencesValues: Record<string, unknown>
  preferenceUpdatedAt: Record<string, number>
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
      remote.conversationStore.conversations as Conversation[]
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

  const changed =
    contactsChanged ||
    deletedContactsChanged ||
    defsChanged ||
    conversationsChanged ||
    reportsChanged ||
    dayPlansChanged ||
    recurringPlansChanged ||
    prefsChanged ||
    mergedConversationTombstones.length !== local.deletedConversations.length ||
    mergedReportTombstones.length !== local.deletedServiceReports.length

  return {
    contacts: contactsFinal,
    deletedContacts: deletedContactsFinal,
    customFieldDefs: mergedDefs,
    conversations: conversationsAfterTombstones,
    deletedConversations: mergedConversationTombstones,
    serviceReports: reportsAfterTombstones,
    dayPlans: mergedDayPlans,
    recurringPlans: mergedRecurringPlans,
    deletedServiceReports: mergedReportTombstones,
    preferencesValues: mergedPrefValues,
    preferenceUpdatedAt: mergedPrefTimestamps,
    changed,
  }
}

// --- Helpers ---------------------------------------------------------------

type WithId = { id: string; updatedAt?: number }

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
  now: number
): T[] {
  const byId = new Map<string, T>()
  for (const t of [...local, ...remote]) {
    const existing = byId.get(t.id)
    if (!existing || t.deletedAt > existing.deletedAt) {
      byId.set(t.id, t)
    }
  }
  const cutoff = now - TOMBSTONE_RETENTION_MS
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
  local: ServiceReportsByYears,
  remote: ServiceReportsByYears
): { reports: ServiceReportsByYears; changed: boolean } {
  // Flatten, merge by id, then rebuild the nested structure. O(n) total.
  const flatLocal: ServiceReport[] = []
  for (const year of Object.values(local)) {
    for (const month of Object.values(year)) {
      flatLocal.push(...month)
    }
  }
  const flatRemote: ServiceReport[] = []
  for (const year of Object.values(remote)) {
    for (const month of Object.values(year)) {
      flatRemote.push(...month)
    }
  }
  const { merged, changed } = mergeById(flatLocal, flatRemote)

  const rebuilt: ServiceReportsByYears = {}
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
  reports: ServiceReportsByYears,
  tombstones: ServiceReportTombstone[]
): ServiceReportsByYears {
  if (tombstones.length === 0) return reports
  const tombsById = new Map(tombstones.map((t) => [t.id, t]))
  const out: ServiceReportsByYears = {}
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
