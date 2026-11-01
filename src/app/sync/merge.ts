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
import type {
  Fuel,
  FuelPrice,
  MileageTombstone,
  Trip,
  Vehicle,
  VehicleSetup,
} from '@/types/mileage'
import type { PetRecord, PetRoomRecord, PetTombstone } from '@/types/pet'
import {
  keptKeepsakes,
  keptPurchases,
  keptRoomItems,
  keptWakes,
} from '@/lib/petHistory'
import { RecurringPlan } from '@/lib/serviceReport'
import { momentStoredDate } from '@/lib/normalizeDate'
import { mergePreferences } from '@/app/sync/preferencesMerge'
import { canonicalJson } from '@/lib/canonicalJson'
import {
  NON_SYNCABLE_PREFERENCE_KEYS,
  NON_SYNCABLE_PROFILE_KEYS,
} from '@/lib/syncPreferencePolicy'
import { SyncPayload } from '@/app/sync/payload'

export type MergeResult = {
  contacts: Contact[]
  deletedContacts: Contact[]
  customFieldDefs: CustomFieldDefinition[]
  deletedCustomFieldDefs: CustomFieldTombstone[]
  conversations: Visit[]
  deletedConversations: VisitTombstone[]
  conversationFieldDefs: CustomFieldDefinition[]
  deletedConversationFieldDefs: CustomFieldTombstone[]
  serviceReports: TimeEntriesByYear
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  deletedServiceReports: TimeEntryTombstone[]
  deletedDayPlans: PlanTombstone[]
  deletedRecurringPlans: PlanTombstone[]
  categories: Category[]
  deletedCategories: CategoryTombstone[]
  vehicles: Vehicle[]
  fuels: Fuel[]
  fuelPrices: FuelPrice[]
  vehicleSetups: VehicleSetup[]
  trips: Trip[]
  deletedMileageRecords: MileageTombstone[]
  pets: PetRecord[]
  petRooms: PetRoomRecord[]
  deletedPetRecords: PetTombstone[]
  preferencesValues: Record<string, unknown>
  preferenceUpdatedAt: Record<string, number>
  profileValues: Record<string, unknown>
  profileUpdatedAt: Record<string, number>

  changed: boolean
}

type LocalState = {
  contacts: Contact[]
  deletedContacts: Contact[]
  customFieldDefs: CustomFieldDefinition[]
  deletedCustomFieldDefs: CustomFieldTombstone[]
  conversations: Visit[]
  deletedConversations: VisitTombstone[]

  conversationFieldDefs?: CustomFieldDefinition[]

  deletedConversationFieldDefs?: CustomFieldTombstone[]
  serviceReports: TimeEntriesByYear
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  deletedServiceReports: TimeEntryTombstone[]

  deletedDayPlans?: PlanTombstone[]

  deletedRecurringPlans?: PlanTombstone[]
  categories: Category[]
  deletedCategories: CategoryTombstone[]
  vehicles: Vehicle[]
  fuels: Fuel[]
  fuelPrices: FuelPrice[]
  vehicleSetups: VehicleSetup[]
  trips: Trip[]
  deletedMileageRecords: MileageTombstone[]
  pets: PetRecord[]
  petRooms: PetRoomRecord[]
  deletedPetRecords: PetTombstone[]
  preferencesValues: Record<string, unknown>
  preferenceUpdatedAt: Record<string, number>
  profileValues: Record<string, unknown>
  profileUpdatedAt: Record<string, number>
}

export function mergePayload(
  localState: LocalState,
  remote: SyncPayload
): MergeResult {
  const now = syncNow()

  const originalLocal = {
    ...localState,
    deletedDayPlans: localState.deletedDayPlans ?? [],
    deletedRecurringPlans: localState.deletedRecurringPlans ?? [],
    conversationFieldDefs: localState.conversationFieldDefs ?? [],
    deletedConversationFieldDefs: localState.deletedConversationFieldDefs ?? [],
  }
  const local = translateSyncTimestamps(originalLocal, 0, now + 5 * 60_000)
  remote = translateSyncTimestamps(remote, 0, now + 5 * 60_000)

  const { merged: mergedContacts } = mergeById(
    local.contacts,
    remote.contactStore.contacts as Contact[]
  )

  const mergedDeletedContacts = mergeDeletedContacts(
    local.deletedContacts,
    remote.contactStore.deletedContacts as Contact[]
  )

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

  const { activeFinal: contactsFinal, deletedFinal: deletedContactsFinal } =
    reconcileActiveAndDeletedContacts(mergedContacts, mergedDeletedContacts)

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

  const remoteConversationFieldDefs = (remote.conversationStore
    .conversationFieldDefs ?? []) as CustomFieldDefinition[]
  const mergedConversationFieldTombstones = mergeTombstones(
    local.deletedConversationFieldDefs,
    remote.conversationStore.deletedConversationFieldDefs ?? [],
    now
  )

  const deletedConversationFieldIds = new Set(
    mergedConversationFieldTombstones.map((tombstone) => tombstone.id)
  )
  const conversationFieldDefsAfterTombstones = mergeById(
    local.conversationFieldDefs,
    remoteConversationFieldDefs
  ).merged.filter((def) => !deletedConversationFieldIds.has(def.id))

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
  ).map((visit) =>
    stripTombstonedCustomFields(
      visit,
      mergedConversationFieldTombstones,
      visit.updatedAt
    )
  )

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

  const remoteMileage = remote.mileageStore
  const mergedMileageTombstones = mergeTombstones(
    local.deletedMileageRecords,
    remoteMileage?.deletedMileageRecords ?? [],
    now
  )
  const mergeMileage = <T extends WithId>(localRecords: T[], remote?: T[]) =>
    applyTombstones(
      mergeById(localRecords, remote ?? []).merged,
      mergedMileageTombstones
    )
  const mergedVehicles = mergeMileage(
    local.vehicles,
    remoteMileage?.vehicles as Vehicle[] | undefined
  )
  const mergedFuels = mergeMileage(
    local.fuels,
    remoteMileage?.fuels as Fuel[] | undefined
  )
  const mergedFuelPrices = mergeMileage(
    local.fuelPrices,
    remoteMileage?.fuelPrices as FuelPrice[] | undefined
  )
  const mergedVehicleSetups = mergeMileage(
    local.vehicleSetups,
    remoteMileage?.vehicleSetups as VehicleSetup[] | undefined
  )
  const mergedTrips = mergeMileage(
    local.trips,
    remoteMileage?.trips as Trip[] | undefined
  )

  const remotePet = remote.petStore
  const mergedPetTombstones = mergeTombstones(
    local.deletedPetRecords,
    remotePet?.deletedPetRecords ?? [],
    now
  )
  const mergePet = <T extends WithId>(localRecords: T[], remote?: T[]) =>
    applyTombstones(
      mergeById(localRecords, remote ?? []).merged,
      mergedPetTombstones
    )
  const remotePets = (remotePet?.pets ?? []) as PetRecord[]
  const mergedPets = mergePetHistory(
    mergePet(local.pets, remotePets),
    [...local.pets, ...remotePets],
    mergedPetTombstones
  )
  const mergedPetRooms = mergePet(
    local.petRooms,
    remotePet?.petRooms as PetRoomRecord[] | undefined
  )

  const { values: mergedPrefValues, updatedAt: mergedPrefTimestamps } =
    mergePreferences(
      local.preferencesValues,
      local.preferenceUpdatedAt,
      remote.preferencesStore.values,
      remote.preferencesStore.updatedAt,
      NON_SYNCABLE_PREFERENCE_KEYS
    )

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
    conversationFieldDefs: conversationFieldDefsAfterTombstones,
    deletedConversationFieldDefs: mergedConversationFieldTombstones,
    serviceReports: reportsAfterTombstones,
    dayPlans: dayPlansAfterTombstones,
    recurringPlans: recurringPlansAfterTombstones,
    deletedServiceReports: mergedReportTombstones,
    deletedDayPlans: mergedDayPlanTombstones,
    deletedRecurringPlans: mergedRecurringPlanTombstones,
    categories: categoriesAfterTombstones,
    deletedCategories: mergedCategoryTombstones,
    vehicles: mergedVehicles,
    fuels: mergedFuels,
    fuelPrices: mergedFuelPrices,
    vehicleSetups: mergedVehicleSetups,
    trips: mergedTrips,
    deletedMileageRecords: mergedMileageTombstones,
    pets: mergedPets,
    petRooms: mergedPetRooms,
    deletedPetRecords: mergedPetTombstones,
    preferencesValues: mergedPrefValues,
    preferenceUpdatedAt: mergedPrefTimestamps,
    profileValues: mergedProfileValues,
    profileUpdatedAt: mergedProfileTimestamps,
  })

  const changed = Object.entries(result).some(
    ([key, value]) =>
      canonicalJson(value) !==
      canonicalJson(originalLocal[key as keyof typeof originalLocal])
  )
  return { ...result, changed }
}

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

    if (!kept.redacted && recordKey(kept) === recordKey(contact)) return contact

    const { legacyIds } = contact as Contact & { legacyIds?: string[] }
    const result = kept.redacted
      ? stripContactForTombstone(kept, kept.updatedAt ?? 0)
      : kept
    return legacyIds?.length ? ({ ...result, legacyIds } as Contact) : result
  })
}

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
      const idx = deletedFinal.findIndex((d) => d.id === c.id)
      if (idx >= 0) deletedFinal.splice(idx, 1)
      activeFinal.push(c)
    }
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
    let winner = t.deletedAt > existing.deletedAt ? t : existing

    if (
      t.deletedAt === existing.deletedAt &&
      !(winner as T & { importUndone?: true }).importUndone &&
      (t as T & { importUndone?: true }).importUndone
    )
      winner = { ...winner, importUndone: true }
    const aliases = [
      ...new Set([
        ...((existing as T & { legacyIds?: string[] }).legacyIds ?? []),
        ...((t as T & { legacyIds?: string[] }).legacyIds ?? []),
      ]),
    ].sort()
    byId.set(t.id, aliases.length ? { ...winner, legacyIds: aliases } : winner)
  }

  return Array.from(byId.values())
}

const sameCompanion = (a: PetRecord, b: PetRecord): boolean =>
  a.id === b.id &&
  a.adoptedOn === b.adoptedOn &&
  (a.seed === undefined || b.seed === undefined || a.seed === b.seed)

function mergePetHistory(
  merged: PetRecord[],
  copies: PetRecord[],
  tombstones: PetTombstone[]
): PetRecord[] {
  return merged.map((pet) => {
    const deletedAt = Math.max(
      0,
      ...tombstones.filter((t) => t.id === pet.id).map((t) => t.deletedAt)
    )
    const same = copies.filter(
      (copy) => (copy.updatedAt ?? 0) > deletedAt && sameCompanion(copy, pet)
    )
    const wakes = keptWakes([
      ...(pet.wakes ?? []),
      ...same.flatMap((copy) => copy.wakes ?? []),
    ])
    const keepsakes = keptKeepsakes([
      ...(pet.keepsakes ?? []),
      ...same.flatMap((copy) => copy.keepsakes ?? []),
    ])
    const earnedRoomItems = keptRoomItems([
      ...(pet.earnedRoomItems ?? []),
      ...same.flatMap((copy) => copy.earnedRoomItems ?? []),
    ])

    const purchases = keptPurchases([
      ...(pet.purchases ?? []),
      ...same.flatMap((copy) => copy.purchases ?? []),
    ])

    const earnedUnchanged =
      earnedRoomItems.length === 0 ||
      canonicalJson(earnedRoomItems) === canonicalJson(pet.earnedRoomItems)
    const purchasesUnchanged =
      purchases.length === 0 ||
      canonicalJson(purchases) === canonicalJson(pet.purchases)
    if (
      canonicalJson(wakes) === canonicalJson(pet.wakes) &&
      canonicalJson(keepsakes) === canonicalJson(pet.keepsakes) &&
      earnedUnchanged &&
      purchasesUnchanged
    )
      return pet
    return {
      ...pet,
      wakes,
      keepsakes,
      ...(earnedUnchanged ? {} : { earnedRoomItems }),
      ...(purchasesUnchanged ? {} : { purchases }),
    }
  })
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

    return ts > deletedAt
  })
}

function mergeServiceReports(
  local: TimeEntriesByYear,
  remote: TimeEntriesByYear
): { reports: TimeEntriesByYear; changed: boolean } {
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
