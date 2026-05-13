import useContacts from '../../stores/contactsStore'
import useConversations from '../../stores/conversationStore'
import useServiceReport from '../../stores/serviceReport'
import { usePreferences } from '../../stores/preferences'
import { NON_SYNCABLE_PREFERENCE_KEYS } from '../../stores/preferences'
import { ProfileAvatar } from '../../types/avatar'
import { sanitizeContactAvatar, sanitizeProfileAvatar } from './avatarPayload'

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
    /**
     * Custom field definitions. Optional in the wire shape because pre-id
     * payloads (written by clients before this feature shipped) won't include
     * them; consumers default to `[]` when absent. Merged by id with per-def
     * `updatedAt` last-writer-wins.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    customFieldDefs?: any[]
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
 * Builds the iCloud payload by snapshotting each zustand store. Intentionally
 * reads state synchronously so the caller (sync layer) can diff and push
 * without waiting on React.
 *
 * Avatar sanitization (drop-or-rewrite) is delegated to `./avatarPayload` and
 * gated on the per-device `iCloudSyncIncludeImages` preference — see that
 * module for the full behavior matrix.
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

  const includeImages = prefs.iCloudSyncIncludeImages === true
  const avatarOpts = { includeImages }

  // Allow-list of preference keys that participate in sync. Anything in
  // NON_SYNCABLE_PREFERENCE_KEYS is explicitly device-local.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syncablePrefs: Record<string, any> = {}
  for (const [key, value] of Object.entries(prefs)) {
    if (typeof value === 'function') continue
    if (NON_SYNCABLE_PREFERENCE_KEYS.has(key)) continue
    if (key === 'avatar') {
      syncablePrefs[key] = sanitizeProfileAvatar(
        value as ProfileAvatar,
        avatarOpts
      )
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
      contacts: contacts.contacts.map((c) =>
        sanitizeContactAvatar(c, avatarOpts)
      ),
      deletedContacts: contacts.deletedContacts.map((c) =>
        sanitizeContactAvatar(c, avatarOpts)
      ),
      customFieldDefs: contacts.customFieldDefs,
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
