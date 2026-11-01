import type { z } from 'zod'
import { translateSyncTimestamps } from '@/app/sync/clockSkew'
import { syncNow, hasCalibratedSyncClock } from '@/lib/syncClock'
import { expireDeletedContactDetails } from '@/lib/contactRetention'
import {
  payloadSchema,
  dropUnreadableRecords,
  dropUnreadableSavedViews,
  dropUnreadableSettings,
  dropUnreadableProfileValues,
} from '@/app/sync/payloadValidation'
import { hasUnsafeKeys } from '@/lib/recordValidation'
import {
  syncableValues,
  NON_SYNCABLE_PROFILE_KEYS as PROFILE_EXCLUDED,
} from '@/lib/syncPreferencePolicy'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import useMileage from '@/stores/mileage'
import { localPetSnapshot } from '@/app/sync/petStoreSync'
import { usePreferences, PREFERENCE_DEFAULTS } from '@/stores/preferences'
import { NON_SYNCABLE_PREFERENCE_KEYS } from '@/stores/preferences'
import {
  useProfile,
  PROFILE_DEFAULTS,
  NON_SYNCABLE_PROFILE_KEYS,
} from '@/stores/profile'
import { ProfileAvatar } from '@/types/avatar'
import type { CustomFieldTombstone } from '@/types/customField'
import type { ResetEpoch } from '@/lib/syncResetEpoch'
import {
  sanitizeContactAvatar,
  sanitizeProfileAvatar,
} from '@/app/sync/avatarPayload'

export const PAYLOAD_VERSION = 1

export type SyncPayload = {
  version: number
  writtenAt: number

  calibratedClock?: boolean
  deviceId: string
  deviceName?: string

  resetEpoch?: ResetEpoch
  contactStore: {
    contacts: any[]

    deletedContacts: any[]

    customFieldDefs?: any[]
    deletedCustomFieldDefs?: CustomFieldTombstone[]
  }
  conversationStore: {
    conversations: any[]
    deletedConversations?: { id: string; deletedAt: number }[]

    conversationFieldDefs?: any[]
    deletedConversationFieldDefs?: CustomFieldTombstone[]

    explicitFollowUps?: boolean
  }
  serviceReportStore: {
    serviceReports: Record<string, Record<string, any[]>>

    dayPlans: any[]

    recurringPlans: any[]
    deletedServiceReports?: { id: string; deletedAt: number }[]

    deletedDayPlans?: { id: string; deletedAt: number }[]
    deletedRecurringPlans?: { id: string; deletedAt: number }[]

    additivePlans?: boolean
  }

  categoryStore?: {
    categories: any[]
    deletedCategories?: { id: string; deletedAt: number }[]
  }

  mileageStore?: {
    vehicles: any[]

    fuels: any[]

    fuelPrices: any[]

    vehicleSetups: any[]

    trips: any[]
    deletedMileageRecords?: { id: string; deletedAt: number }[]
  }

  petStore?: {
    pets: any[]

    petRooms: any[]
    deletedPetRecords?: { id: string; deletedAt: number }[]
  }
  preferencesStore: {
    values: Record<string, any>
    updatedAt: Record<string, number>
  }

  profileStore?: {
    values: Record<string, any>
    updatedAt: Record<string, number>
  }
}

export function buildPayload(args: {
  deviceId: string
  deviceName?: string
}): SyncPayload {
  const { deviceId, deviceName } = args
  const contacts = useContacts.getState()
  const conversations = useConversations.getState()
  const serviceReports = useServiceReport.getState()
  const categories = useCategories.getState()
  const mileage = useMileage.getState()
  const prefs = usePreferences.getState()
  const profile = useProfile.getState()

  const includeImages = prefs.iCloudSyncIncludeImages === true
  const avatarOpts = { includeImages }

  const syncablePrefs: Record<string, any> = {}
  for (const [key, value] of Object.entries(prefs)) {
    if (typeof value === 'function') continue
    if (NON_SYNCABLE_PREFERENCE_KEYS.has(key)) continue
    syncablePrefs[key] = value
  }

  const syncableProfile: Record<string, any> = {}
  for (const [key, value] of Object.entries(profile)) {
    if (typeof value === 'function') continue
    if (NON_SYNCABLE_PROFILE_KEYS.has(key)) continue
    if (key === 'avatar') {
      syncableProfile[key] = sanitizeProfileAvatar(
        value as ProfileAvatar,
        avatarOpts
      )
      continue
    }
    syncableProfile[key] = value
  }

  return translateSyncTimestamps({
    version: PAYLOAD_VERSION,
    calibratedClock: hasCalibratedSyncClock(),
    writtenAt: syncNow(),
    deviceId,
    deviceName,
    ...(prefs.iCloudResetEpoch ? { resetEpoch: prefs.iCloudResetEpoch } : {}),
    contactStore: {
      contacts: contacts.contacts.map((c) =>
        sanitizeContactAvatar(c, avatarOpts)
      ),
      deletedContacts: expireDeletedContactDetails(
        contacts.deletedContacts
      ).map((c) => sanitizeContactAvatar(c, avatarOpts)),
      customFieldDefs: contacts.customFieldDefs,
      deletedCustomFieldDefs: contacts.deletedCustomFieldDefs,
    },
    conversationStore: {
      conversations: conversations.conversations,
      deletedConversations: conversations.deletedConversations,
      conversationFieldDefs: conversations.conversationFieldDefs,
      deletedConversationFieldDefs: conversations.deletedConversationFieldDefs,
      explicitFollowUps: true,
    },
    serviceReportStore: {
      serviceReports: serviceReports.serviceReports,
      dayPlans: serviceReports.dayPlans,
      recurringPlans: serviceReports.recurringPlans,
      deletedServiceReports: serviceReports.deletedServiceReports,
      deletedDayPlans: serviceReports.deletedDayPlans,
      deletedRecurringPlans: serviceReports.deletedRecurringPlans,
      additivePlans: true,
    },
    categoryStore: {
      categories: categories.categories,
      deletedCategories: categories.deletedCategories,
    },
    mileageStore: {
      vehicles: mileage.vehicles,
      fuels: mileage.fuels,
      fuelPrices: mileage.fuelPrices,
      vehicleSetups: mileage.vehicleSetups,
      trips: mileage.trips,
      deletedMileageRecords: mileage.deletedMileageRecords,
    },
    petStore: localPetSnapshot(),
    preferencesStore: {
      values: syncablePrefs,
      updatedAt: prefs.preferenceUpdatedAt ?? {},
    },
    profileStore: {
      values: syncableProfile,
      updatedAt: profile.profileUpdatedAt ?? {},
    },
  })
}

import { normalizeLegacyPayloadFieldNames } from '@/app/sync/payloadFieldRenames'
import { normalizeLegacyFollowUps } from '@/app/sync/payloadFollowUps'
import { normalizeLegacyPlans } from '@/app/sync/payloadAdditivePlans'
import { sanitizeNoteDocs } from '@/app/sync/payloadNotes'

export type PayloadRejection = {
  reason:
    | 'invalid-json'
    | 'unsafe-keys'
    | 'newer-version'
    | 'invalid-frame'
    | 'threw'

  issues?: string[]

  step?: string

  error?: string
}

const MAX_REJECTION_ISSUES = 5

function frameIssues(issues: z.ZodIssue[]): string[] {
  const problems = new Set<string>()
  for (const issue of issues) {
    const fields = issue.path
      .filter((key) => typeof key === 'string')
      .map((key) => (/^[A-Za-z_$][\w$]*$/.test(key) ? key : '*'))
    problems.add(`${fields.join('.')}:${issue.code}`)
  }
  return [...problems].slice(0, MAX_REJECTION_ISSUES)
}

function hasNewerVersion(data: unknown): boolean {
  const version: unknown = (data as { version?: unknown } | null)?.version
  return typeof version === 'number' && version > PAYLOAD_VERSION
}

export function parsePayload(
  json: string,
  onDropped?: (fields: string[]) => void,
  onRejected?: (rejection: PayloadRejection) => void
): SyncPayload | null {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    onRejected?.({ reason: 'invalid-json' })
    return null
  }
  let step = 'unsafe-keys'
  try {
    if (hasUnsafeKeys(data)) {
      onRejected?.({ reason: 'unsafe-keys' })
      return null
    }
    if (hasNewerVersion(data)) {
      onRejected?.({ reason: 'newer-version' })
      return null
    }

    step = 'schema'
    const dropped: string[] = []
    let result = payloadSchema.safeParse(data)
    if (!result.success) {
      step = 'salvage'
      dropped.push(...dropUnreadableRecords(data))
      result = payloadSchema.safeParse(data)
    }
    if (!result.success) {
      if (dropped.length) onDropped?.(dropped)
      onRejected?.({
        reason: 'invalid-frame',
        issues: frameIssues(result.error.issues),
      })
      return null
    }
    const d = result.data
    step = 'field-names'
    normalizeLegacyPayloadFieldNames(d)
    step = 'follow-ups'
    normalizeLegacyFollowUps(d)
    step = 'plans'
    normalizeLegacyPlans(d)
    step = 'notes'
    sanitizeNoteDocs(d as unknown as Record<string, unknown>)
    step = 'settings'
    dropUnreadableSavedViews(d.preferencesStore)
    for (const key of dropUnreadableSettings(
      d.preferencesStore,
      PREFERENCE_DEFAULTS
    ))
      dropped.push(`preferencesStore.${key}`)
    step = 'profile'
    if (d.profileStore)
      for (const key of dropUnreadableProfileValues(d.profileStore))
        dropped.push(`profileStore.${key}`)
    if (dropped.length) onDropped?.(dropped)
    step = 'syncable'
    const knownPreferences = Object.fromEntries(
      Object.entries(d.preferencesStore.values).filter(([key]) =>
        Object.hasOwn(PREFERENCE_DEFAULTS, key)
      )
    )
    d.preferencesStore.values = syncableValues(knownPreferences)
    if (d.profileStore)
      d.profileStore.values = syncableValues(
        Object.fromEntries(
          Object.entries(d.profileStore.values).filter(([key]) =>
            Object.hasOwn(PROFILE_DEFAULTS, key)
          )
        ),
        PROFILE_EXCLUDED
      )
    return d as SyncPayload
  } catch (error) {
    onRejected?.({
      reason: 'threw',
      step,
      error: error instanceof Error ? error.name : typeof error,
    })
    return null
  }
}

export function isNewerPayloadVersion(json: string): boolean {
  try {
    return hasNewerVersion(JSON.parse(json))
  } catch {
    return false
  }
}
