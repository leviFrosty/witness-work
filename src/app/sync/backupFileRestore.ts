import semver from 'semver'
import { PAYLOAD_VERSION, parsePayload } from '@/app/sync/payload'
import { countRecords } from '@/app/sync/payloadValidation'
import { BACKUP_FILE_VERSION, type BackupFile } from '@/lib/backupFile'
import { migrateCustomFieldsToIds } from '@/features/contacts/lib/customFieldsMigration'
import type { Contact } from '@/types/contact'
import type { CustomFieldDefinition } from '@/types/customField'
import {
  migrateNormalizeDates,
  type PersistedServiceReportState,
} from '@/lib/normalizeDate'
import { petSliceFromBackup } from '@/lib/petBackup'
import { extractProfileFromPreferences } from '@/lib/profileMigration'
import { withRemoteDataMutation } from '@/lib/remoteDataMutation'
import {
  syncableValues,
  NON_SYNCABLE_PROFILE_KEYS,
  SYNC_UNION_KEYS,
  unionPreference,
} from '@/lib/syncPreferencePolicy'
import useCategories from '@/stores/categories'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useMileage from '@/stores/mileage'
import usePet from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import { useProfile } from '@/stores/profile'

type Slice = Record<string, unknown>

const isRecord = (value: unknown): value is Slice =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const EXPLICIT_FOLLOW_UPS_SINCE = '1.43.0'

const ADDITIVE_PLANS_SINCE = '1.44.0'

const LEGACY_PREFERENCE_KEYS = [
  'publisher',
  'excludedWeekdays',
  'meetingWeekdays',
  'pioneerStartDate',
  'oneOffGoalHours',
]

function writtenBefore(preferences: Slice, release: string): boolean {
  if (LEGACY_PREFERENCE_KEYS.some((key) => Object.hasOwn(preferences, key)))
    return true
  const { lastAppVersion } = preferences
  const version =
    typeof lastAppVersion === 'string' ? semver.valid(lastAppVersion) : null
  return version !== null && semver.lt(version, release)
}

function withParsed(original: Slice, parsed: Slice): Slice {
  const result = { ...original }
  for (const key of Object.keys(original))
    if (Object.hasOwn(parsed, key)) result[key] = parsed[key]
  return result
}

export function normalizeBackupFile(
  data: BackupFile
): { file: BackupFile; droppedRecords: number } | null {
  const preferences = isRecord(data.preferencesStore)
    ? data.preferencesStore
    : {}
  const contacts = isRecord(data.contactStore) ? data.contactStore : undefined
  const visits = isRecord(data.conversationStore)
    ? data.conversationStore
    : undefined
  const reports = isRecord(data.serviceReportStore)
    ? data.serviceReportStore
    : undefined
  const profile = isRecord(data.profileStore) ? data.profileStore : undefined
  const categories = isRecord(data.categoryStore)
    ? data.categoryStore
    : undefined
  const mileage = isRecord(data.mileageStore) ? data.mileageStore : undefined

  const payload = {
    version: PAYLOAD_VERSION,
    writtenAt: Date.now(),
    deviceId: 'backup-file',
    contactStore: { contacts: [], deletedContacts: [], ...contacts },
    conversationStore: {
      conversations: [],
      ...visits,
      explicitFollowUps:
        visits?.explicitFollowUps === true ||
        !writtenBefore(preferences, EXPLICIT_FOLLOW_UPS_SINCE),
    },
    serviceReportStore: {
      serviceReports: {},
      dayPlans: [],
      recurringPlans: [],
      ...reports,
      additivePlans:
        reports?.additivePlans === true ||
        !writtenBefore(preferences, ADDITIVE_PLANS_SINCE),
    },
    ...(categories ? { categoryStore: { categories: [], ...categories } } : {}),
    ...(mileage
      ? {
          mileageStore: {
            vehicles: [],
            fuels: [],
            fuelPrices: [],
            vehicleSetups: [],
            trips: [],
            ...mileage,
          },
        }
      : {}),
    preferencesStore: { values: preferences, updatedAt: {} },
    ...(profile ? { profileStore: { values: profile, updatedAt: {} } } : {}),
  }
  const parsed = parsePayload(JSON.stringify(payload))
  if (!parsed) return null

  const result: BackupFile = { ...data }
  if (contacts) result.contactStore = withParsed(contacts, parsed.contactStore)
  if (visits)
    result.conversationStore = withParsed(visits, parsed.conversationStore)
  if (reports)
    result.serviceReportStore = withParsed(reports, {
      ...parsed.serviceReportStore,
      ...migrateNormalizeDates(
        parsed.serviceReportStore as unknown as PersistedServiceReportState
      ),
    })
  if (categories && parsed.categoryStore)
    result.categoryStore = withParsed(categories, parsed.categoryStore)
  if (mileage && parsed.mileageStore)
    result.mileageStore = withParsed(mileage, parsed.mileageStore)
  if (isRecord(data.preferencesStore))
    result.preferencesStore = parsed.preferencesStore.values

  if (parsed.profileStore) result.profileStore = parsed.profileStore.values
  return {
    file: result,
    droppedRecords: countRecords(payload) - countRecords(parsed),
  }
}

function withLegacyCustomFields(contactStore: Slice, preferences: unknown) {
  const legacyLabels = isRecord(preferences)
    ? preferences.customContactFields
    : undefined
  if (!Array.isArray(legacyLabels) || 'customFieldDefs' in contactStore)
    return contactStore
  const localDefs = useContacts.getState().customFieldDefs
  const migrated = migrateCustomFieldsToIds({
    legacyLabels: legacyLabels.filter(
      (label): label is string => typeof label === 'string'
    ),
    contacts: (contactStore.contacts ?? []) as Contact[],
    deletedContacts: (contactStore.deletedContacts ?? []) as Contact[],
    now: Date.now(),
  })
  const localIds = new Map<string, string>()
  for (const def of localDefs) {
    if (!def.archived) localIds.set(`label:${def.label.trim()}`, def.id)
    for (const alias of def.legacyIds ?? []) localIds.set(alias, def.id)
    localIds.set(def.id, def.id)
  }
  const target = new Map<string, string>()
  const added: CustomFieldDefinition[] = []
  let order = Math.max(-1, ...localDefs.map((def) => def.order))
  for (const def of migrated.defs) {
    const local = localIds.get(def.id) ?? localIds.get(`label:${def.label}`)
    target.set(def.id, local ?? def.id)
    if (!local) added.push({ ...def, order: ++order })
  }
  const rekey = (contact: Contact): Contact =>
    contact.customFields
      ? {
          ...contact,
          customFields: Object.fromEntries(
            Object.entries(contact.customFields).map(([id, value]) => [
              target.get(id) ?? id,
              value,
            ])
          ),
        }
      : contact
  return {
    ...contactStore,
    contacts: migrated.contacts.map(rekey),
    deletedContacts: migrated.deletedContacts.map(rekey),
    customFieldDefs: [...localDefs, ...added],
  }
}

function knownSlice(value: unknown, state: Slice): Slice {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => Object.hasOwn(state, key) && typeof state[key] !== 'function'
    )
  )
}

export type BackupFileRestore =
  | { ok: true; droppedRecords: number }
  | { ok: false; problem: 'newer' | 'unreadable' }

export function restoreBackupFile(file: BackupFile): BackupFileRestore {
  const { version } = file as { version?: unknown }
  if (typeof version === 'number' && version > BACKUP_FILE_VERSION)
    return { ok: false, problem: 'newer' }
  const normalized = normalizeBackupFile(file)
  if (!normalized) return { ok: false, problem: 'unreadable' }
  const data = normalized.file
  withRemoteDataMutation(() => {
    if (data.contactStore)
      useContacts
        .getState()
        .set(
          knownSlice(
            withLegacyCustomFields(
              data.contactStore as Slice,
              file.preferencesStore
            ),
            useContacts.getState()
          )
        )
    if (data.conversationStore)
      useConversations
        .getState()
        .set(knownSlice(data.conversationStore, useConversations.getState()))
    if (data.serviceReportStore)
      useServiceReport
        .getState()
        .set(knownSlice(data.serviceReportStore, useServiceReport.getState()))
    if (data.categoryStore)
      useCategories
        .getState()
        .set(knownSlice(data.categoryStore, useCategories.getState()))
    if (data.mileageStore)
      useMileage
        .getState()
        .set(knownSlice(data.mileageStore, useMileage.getState()))

    if (data.petStore) usePet.getState().set(petSliceFromBackup(data.petStore))
    const preferences = extractProfileFromPreferences(
      knownSlice(data.preferencesStore, {
        ...usePreferences.getState(),
        ...useProfile.getState(),
      })
    )
    const restored = syncableValues(preferences.preferences)
    const current = usePreferences.getState()
    usePreferences.getState().set({
      ...restored,

      earnedBadges: {
        ...((restored.earnedBadges as typeof current.earnedBadges) ?? {}),
        ...current.earnedBadges,
      },
      badgeLedger: [
        ...new Set([
          ...((restored.badgeLedger as string[]) ?? []),
          ...current.badgeLedger,
        ]),
      ].sort(),

      badgesBackfilledAt: null,

      ...Object.fromEntries(
        [...SYNC_UNION_KEYS]
          .filter((key) => key in restored)
          .map((key) => [
            key,
            unionPreference(
              current[key as keyof typeof current],
              restored[key]
            ),
          ])
      ),
    })
    const profile = data.profileStore ?? preferences.profile.values
    useProfile
      .getState()
      .set(
        syncableValues(
          knownSlice(profile, useProfile.getState()),
          NON_SYNCABLE_PROFILE_KEYS
        )
      )
  })
  return { ok: true, droppedRecords: normalized.droppedRecords }
}
