import useContacts from '../../stores/contactsStore'
import useConversations from '../../stores/conversationStore'
import useServiceReport from '../../stores/serviceReport'
import { usePreferences } from '../../stores/preferences'
import { NON_SYNCABLE_PREFERENCE_KEYS } from '../../stores/preferences'
import { Contact } from '../../types/contact'
import { ProfileAvatar } from '../../stores/preferences'

/**
 * Bumped whenever the payload shape changes in a breaking way. Consumers reject
 * unknown versions rather than corrupt local state. Mirrors the pattern used by
 * the widget snapshot.
 */
export const PAYLOAD_VERSION = 1

export type SyncPayload = {
  version: number
  writtenAt: number
  deviceId: string
  deviceName?: string
  contactStore: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contacts: any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deletedContacts: any[]
  }
  conversationStore: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conversations: any[]
    deletedConversations?: { id: string; deletedAt: number }[]
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
  preferencesStore: {
    // Partial because we only sync the allow-listed, cross-device-safe keys.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    values: Record<string, any>
    updatedAt: Record<string, number>
  }
}

/**
 * Strips `avatar` from a contact when it holds a user-uploaded image. The
 * `value` field is a per-device `file://` URI inside
 * `FileSystem.documentDirectory`, which would be a dead path on any other
 * device. Emoji + `none` avatars are safe to sync as-is.
 *
 * Phase 1 is unconditional; Phase 2 (see docs/icloud-image-sync-plan.md) will
 * gate this on the `iCloudSyncIncludeImages` preference once the binary sync
 * bridge lands.
 */
function stripImageAvatar(contact: Contact): Contact {
  if (contact.avatar?.type !== 'image') return contact
  const rest: Contact = { ...contact }
  delete rest.avatar
  return rest
}

/** Same rule as `stripImageAvatar`, applied to the profile-avatar preference. */
function stripImageProfileAvatar(
  avatar: ProfileAvatar | undefined
): ProfileAvatar | undefined {
  if (avatar?.type === 'image') return { type: 'none', value: '' }
  return avatar
}

/**
 * Builds the iCloud payload by snapshotting each zustand store. Intentionally
 * reads state synchronously so the caller (sync layer) can diff and push
 * without waiting on React.
 */
export function buildPayload(args: {
  deviceId: string
  deviceName?: string
}): SyncPayload {
  const { deviceId, deviceName } = args
  const contacts = useContacts.getState()
  const conversations = useConversations.getState()
  const serviceReports = useServiceReport.getState()
  const prefs = usePreferences.getState()

  // Allow-list of preference keys that participate in sync. Anything in
  // NON_SYNCABLE_PREFERENCE_KEYS is explicitly device-local.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syncablePrefs: Record<string, any> = {}
  for (const [key, value] of Object.entries(prefs)) {
    if (typeof value === 'function') continue
    if (NON_SYNCABLE_PREFERENCE_KEYS.has(key)) continue
    if (key === 'avatar') {
      syncablePrefs[key] = stripImageProfileAvatar(value as ProfileAvatar)
      continue
    }
    syncablePrefs[key] = value
  }

  return {
    version: PAYLOAD_VERSION,
    writtenAt: Date.now(),
    deviceId,
    deviceName,
    contactStore: {
      contacts: contacts.contacts.map(stripImageAvatar),
      deletedContacts: contacts.deletedContacts.map(stripImageAvatar),
    },
    conversationStore: {
      conversations: conversations.conversations,
      deletedConversations: conversations.deletedConversations,
    },
    serviceReportStore: {
      serviceReports: serviceReports.serviceReports,
      dayPlans: serviceReports.dayPlans,
      recurringPlans: serviceReports.recurringPlans,
      deletedServiceReports: serviceReports.deletedServiceReports,
    },
    preferencesStore: {
      values: syncablePrefs,
      updatedAt: prefs.preferenceUpdatedAt ?? {},
    },
  }
}

/**
 * Parses and validates a JSON-encoded payload. Returns null if the JSON is
 * malformed or the shape is unrecognizable — the caller should treat that as
 * "leave local state alone, surface a sync error in settings."
 */
export function parsePayload(json: string): SyncPayload | null {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any
  if (typeof d.version !== 'number') return null
  if (d.version > PAYLOAD_VERSION) return null
  if (!d.contactStore || !d.conversationStore || !d.serviceReportStore) {
    return null
  }
  return d as SyncPayload
}
