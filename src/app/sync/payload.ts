import { translateSyncTimestamps } from '@/app/sync/clockSkew'
import { syncNow, hasCalibratedSyncClock } from '@/lib/syncClock'
import { expireDeletedContactDetails } from '@/lib/contactRetention'
import {
  payloadSchema,
  hasUnsafeKeys,
  validSettingValues,
  validProfileValues,
} from '@/app/sync/payloadValidation'
import {
  syncableValues,
  NON_SYNCABLE_PROFILE_KEYS as PROFILE_EXCLUDED,
} from '@/lib/syncPreferencePolicy'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { usePreferences, PREFERENCE_DEFAULTS } from '@/stores/preferences'
import { NON_SYNCABLE_PREFERENCE_KEYS } from '@/stores/preferences'
import {
  useProfile,
  PROFILE_DEFAULTS,
  NON_SYNCABLE_PROFILE_KEYS,
} from '@/stores/profile'
import { ProfileAvatar } from '@/types/avatar'
import type { CustomFieldTombstone } from '@/types/customField'
import {
  sanitizeContactAvatar,
  sanitizeProfileAvatar,
} from '@/app/sync/avatarPayload'

/**
 * Bumped whenever the payload shape changes in a breaking way. Consumers reject
 * unknown versions rather than corrupt local state. Mirrors the pattern used by
 * the widget snapshot.
 */
export const PAYLOAD_VERSION = 1

export type SyncPayload = {
  version: number
  writtenAt: number
  /**
   * New writers use a calibrated clock, so replication delays need no
   * translation.
   */
  calibratedClock?: boolean
  deviceId: string
  deviceName?: string
  contactStore: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contacts: any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deletedContacts: any[]
    /**
     * Custom field definitions. Optional in the wire shape because pre-id
     * payloads (written by clients before this feature shipped) won't include
     * them; consumers default to `[]` when absent. Merged by id with per-def
     * `updatedAt` last-writer-wins.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    customFieldDefs?: any[]
    deletedCustomFieldDefs?: CustomFieldTombstone[]
  }
  conversationStore: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conversations: any[]
    deletedConversations?: { id: string; deletedAt: number }[]
    /**
     * `true` when written by a build with the visit form's Follow Up switch,
     * where a Visit carries `followUp` only if the user wants one. Absent on
     * payloads from older builds, which attached a placeholder follow-up to
     * every Visit; `parsePayload` strips those on read. Additive so older
     * builds keep accepting our payloads. See `payloadFollowUps.ts`.
     */
    explicitFollowUps?: boolean
  }
  serviceReportStore: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    serviceReports: Record<string, Record<string, any[]>>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dayPlans: any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recurringPlans: any[]
    deletedServiceReports?: { id: string; deletedAt: number }[]
  }
  /**
   * User-defined Category records (the first-class shape that replaces the
   * legacy `preferences.serviceReportTags`). Optional in the wire shape because
   * pre-Category payloads from older app versions won't include it — consumers
   * default to `[]` when absent.
   */
  categoryStore?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    categories: any[]
    deletedCategories?: { id: string; deletedAt: number }[]
  }
  preferencesStore: {
    // Partial because we only sync the allow-listed, cross-device-safe keys.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    values: Record<string, any>
    updatedAt: Record<string, number>
  }
  /**
   * Identity-shaped fields (name, avatar, avatar background, profile-setup
   * completion). Split out of `preferencesStore` in wave-3 of the
   * store-narrowing series. Optional in the wire shape because older clients
   * write profile fields _inside_ `preferencesStore.values`; on read we rewrite
   * those into this slice via `normalizeLegacyPayloadFieldNames`.
   */
  profileStore?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    values: Record<string, any>
    updatedAt: Record<string, number>
  }
}

/**
 * Builds the iCloud payload by snapshotting each zustand store. Intentionally
 * reads state synchronously so the caller (sync layer) can diff and push
 * without waiting on React.
 *
 * Avatar references are sanitized by `./avatarPayload`. Per-device consent
 * controls only binary uploads/downloads.
 */
export function buildPayload(args: {
  deviceId: string
  deviceName?: string
}): SyncPayload {
  const { deviceId, deviceName } = args
  const contacts = useContacts.getState()
  const conversations = useConversations.getState()
  const serviceReports = useServiceReport.getState()
  const categories = useCategories.getState()
  const prefs = usePreferences.getState()
  const profile = useProfile.getState()

  const includeImages = prefs.iCloudSyncIncludeImages === true
  const avatarOpts = { includeImages }

  // Allow-list of preference keys that participate in sync. Anything in
  // NON_SYNCABLE_PREFERENCE_KEYS is explicitly device-local.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syncablePrefs: Record<string, any> = {}
  for (const [key, value] of Object.entries(prefs)) {
    if (typeof value === 'function') continue
    if (NON_SYNCABLE_PREFERENCE_KEYS.has(key)) continue
    syncablePrefs[key] = value
  }

  // Profile slice — same allow-list pattern. The avatar field is sanitized
  // identically to how it used to be inside `preferencesStore.values`, just
  // routed through the new slice so the wire shape matches the on-device
  // store split. Older clients still pre-wave-3 will receive these values
  // back in their `preferencesStore.values` because the receiving side keeps
  // the legacy shape; the sync-time translation on read folds them back into
  // `profileStore`. See `payloadFieldRenames.ts`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      explicitFollowUps: true,
    },
    serviceReportStore: {
      serviceReports: serviceReports.serviceReports,
      dayPlans: serviceReports.dayPlans,
      recurringPlans: serviceReports.recurringPlans,
      deletedServiceReports: serviceReports.deletedServiceReports,
    },
    categoryStore: {
      categories: categories.categories,
      deletedCategories: categories.deletedCategories,
    },
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

/**
 * Parses and validates a JSON-encoded payload. Returns null if the JSON is
 * malformed or the shape is unrecognizable — the caller should treat that as
 * "leave local state alone, surface a sync error in settings."
 *
 * Also translates legacy preference field names from older app versions so the
 * merge step sees the canonical schema, and strips placeholder follow-ups from
 * payloads written before the visit form's Follow Up switch existed. The wire
 * payload version (`PAYLOAD_VERSION`) is intentionally NOT bumped for either —
 * receivers normalize on read. See `payloadFieldRenames.ts` for the rename
 * table and `payloadFollowUps.ts` for the follow-up rule.
 */
export function parsePayload(json: string): SyncPayload | null {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return null
  }
  try {
    if (hasUnsafeKeys(data)) return null
    const result = payloadSchema.safeParse(data)
    if (!result.success || result.data.version > PAYLOAD_VERSION) return null
    const d = result.data
    normalizeLegacyPayloadFieldNames(d)
    normalizeLegacyFollowUps(d)
    if (
      !validSettingValues(d.preferencesStore.values, PREFERENCE_DEFAULTS) ||
      (d.profileStore && !validProfileValues(d.profileStore.values))
    )
      return null
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
  } catch {
    return null
  }
}

/**
 * Whether `parsePayload` rejected `json` for coming from a newer app version.
 * Unlike a malformed file, it holds real data this build can't merge, so
 * callers treat the remote as unreadable rather than absent.
 */
export function isNewerPayloadVersion(json: string): boolean {
  try {
    const version: unknown = (JSON.parse(json) as { version?: unknown })
      ?.version
    return typeof version === 'number' && version > PAYLOAD_VERSION
  } catch {
    return false
  }
}
