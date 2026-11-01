import { mergePayload, type MergeResult } from '@/app/sync/merge'
import { localMileageSnapshot } from '@/app/sync/mileageStoreSync'
import type { SyncPayload } from '@/app/sync/payload'
import useCategories from '@/stores/categories'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'

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
  conversationFieldDefs: [],
  deletedConversationFieldDefs: [],
  serviceReports: {},
  dayPlans: [],
  recurringPlans: [],
  deletedServiceReports: [],
  deletedDayPlans: [],
  deletedRecurringPlans: [],
  categories: [],
  deletedCategories: [],
  vehicles: [],
  fuels: [],
  fuelPrices: [],
  vehicleSetups: [],
  trips: [],
  deletedMileageRecords: [],
  pets: [],
  petRooms: [],
  deletedPetRecords: [],
  preferencesValues: {},
  preferenceUpdatedAt: {},
  profileValues: {},
  profileUpdatedAt: {},
  ...overrides,
})

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
      conversationFieldDefs: conversations.conversationFieldDefs,
      deletedConversationFieldDefs: conversations.deletedConversationFieldDefs,
      serviceReports: serviceReport.serviceReports,
      dayPlans: serviceReport.dayPlans,
      recurringPlans: serviceReport.recurringPlans,
      deletedServiceReports: serviceReport.deletedServiceReports,
      deletedDayPlans: serviceReport.deletedDayPlans,
      deletedRecurringPlans: serviceReport.deletedRecurringPlans,
      categories: categories.categories,
      deletedCategories: categories.deletedCategories,
      ...localMileageSnapshot(),
    })
  )
}

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
    conversationFieldDefs: device.conversationFieldDefs,
    deletedConversationFieldDefs: device.deletedConversationFieldDefs,
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
  mileageStore: {
    vehicles: device.vehicles,
    fuels: device.fuels,
    fuelPrices: device.fuelPrices,
    vehicleSetups: device.vehicleSetups,
    trips: device.trips,
    deletedMileageRecords: device.deletedMileageRecords,
  },
  petStore: {
    pets: device.pets,
    petRooms: device.petRooms,
    deletedPetRecords: device.deletedPetRecords,
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

export const timeEntriesOf = (device: DeviceState) =>
  Object.values(device.serviceReports).flatMap((months) =>
    Object.values(months).flat()
  )
