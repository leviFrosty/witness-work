import { mergePayload, type MergeResult } from '@/app/sync/merge'
import type { SyncPayload } from '@/app/sync/payload'
import useCategories from '@/stores/categories'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'

/**
 * Simulates iCloud sync between devices for tests: each device is a snapshot of
 * its synced records, and a pull folds another device's payload in through the
 * real `mergePayload`, as `pullAndMerge` does.
 */
export type DeviceState = Omit<MergeResult, 'changed'>

export const emptyDevice = (
  overrides: Partial<DeviceState> = {}
): DeviceState => ({
  contacts: [],
  deletedContacts: [],
  customFieldDefs: [],
  deletedCustomFieldDefs: [],
  conversations: [],
  deletedConversations: [],
  serviceReports: {},
  dayPlans: [],
  recurringPlans: [],
  deletedServiceReports: [],
  deletedDayPlans: [],
  deletedRecurringPlans: [],
  categories: [],
  deletedCategories: [],
  preferencesValues: {},
  preferenceUpdatedAt: {},
  profileValues: {},
  profileUpdatedAt: {},
  ...overrides,
})

/**
 * A copy of the records in this test's zustand stores, as a device. Deep-copied
 * because store actions mutate nested month buckets of the previous state, so a
 * plain snapshot would change under a later action.
 */
export const deviceFromStores = (): DeviceState => {
  const contacts = useContacts.getState()
  const conversations = useConversations.getState()
  const serviceReport = useServiceReport.getState()
  const categories = useCategories.getState()
  return structuredClone(
    emptyDevice({
      contacts: contacts.contacts,
      deletedContacts: contacts.deletedContacts,
      customFieldDefs: contacts.customFieldDefs,
      deletedCustomFieldDefs: contacts.deletedCustomFieldDefs,
      conversations: conversations.conversations,
      deletedConversations: conversations.deletedConversations,
      serviceReports: serviceReport.serviceReports,
      dayPlans: serviceReport.dayPlans,
      recurringPlans: serviceReport.recurringPlans,
      deletedServiceReports: serviceReport.deletedServiceReports,
      deletedDayPlans: serviceReport.deletedDayPlans,
      deletedRecurringPlans: serviceReport.deletedRecurringPlans,
      categories: categories.categories,
      deletedCategories: categories.deletedCategories,
    })
  )
}

/** The payload `device` would write to its iCloud file. */
export const payloadOf = (device: DeviceState): SyncPayload => ({
  version: 1,
  writtenAt: Date.now(),
  deviceId: 'peer',
  contactStore: {
    contacts: device.contacts,
    deletedContacts: device.deletedContacts,
    customFieldDefs: device.customFieldDefs,
    deletedCustomFieldDefs: device.deletedCustomFieldDefs,
  },
  conversationStore: {
    conversations: device.conversations,
    deletedConversations: device.deletedConversations,
  },
  serviceReportStore: {
    serviceReports: device.serviceReports,
    dayPlans: device.dayPlans,
    recurringPlans: device.recurringPlans,
    deletedServiceReports: device.deletedServiceReports,
    deletedDayPlans: device.deletedDayPlans,
    deletedRecurringPlans: device.deletedRecurringPlans,
  },
  categoryStore: {
    categories: device.categories,
    deletedCategories: device.deletedCategories,
  },
  preferencesStore: {
    values: device.preferencesValues,
    updatedAt: device.preferenceUpdatedAt,
  },
  profileStore: {
    values: device.profileValues,
    updatedAt: device.profileUpdatedAt,
  },
})

/** `local` after pulling `remote`'s iCloud file. */
export const pullFrom = (
  local: DeviceState,
  remote: DeviceState
): DeviceState => {
  const { changed: _changed, ...merged } = mergePayload(
    local,
    payloadOf(remote)
  )
  return merged
}

/** Every live Time Entry on `device`, flattened. */
export const timeEntriesOf = (device: DeviceState) =>
  Object.values(device.serviceReports).flatMap((months) =>
    Object.values(months).flat()
  )
