import { mergePayload } from '@/app/sync/merge'
import type { MergeResult } from '@/app/sync/merge'
import type { SyncPayload } from '@/app/sync/payload'
import type { Contact } from '@/types/contact'
import type { CustomFieldDefinition } from '@/types/customField'
import type { Visit } from '@/types/visit'
import type {
  TimeEntriesByYear,
  DayPlan,
  RecurringPlan,
} from '@/types/timeEntry'
import type { Category } from '@/types/category'
import { atNewestResetEpoch } from '@/lib/syncResetEpoch'
import { mileageFromPayload } from '@/app/sync/mileagePayload'
import { petFromPayload } from '@/app/sync/petPayload'

type LocalMergeState = Omit<MergeResult, 'changed'>

export function foldRemotePayloads(
  allPayloads: SyncPayload[]
): SyncPayload | null {
  if (allPayloads.length === 0) return null
  const payloads = atNewestResetEpoch(allPayloads)

  const first = payloads[0]
  let acc: LocalMergeState = {
    contacts: (first.contactStore.contacts ?? []) as Contact[],
    deletedContacts: (first.contactStore.deletedContacts ?? []) as Contact[],
    customFieldDefs: (first.contactStore.customFieldDefs ??
      []) as CustomFieldDefinition[],
    deletedCustomFieldDefs: first.contactStore.deletedCustomFieldDefs ?? [],
    conversations: (first.conversationStore.conversations ?? []) as Visit[],
    deletedConversations: first.conversationStore.deletedConversations ?? [],
    conversationFieldDefs: (first.conversationStore.conversationFieldDefs ??
      []) as CustomFieldDefinition[],
    deletedConversationFieldDefs:
      first.conversationStore.deletedConversationFieldDefs ?? [],
    serviceReports:
      (first.serviceReportStore.serviceReports as TimeEntriesByYear) ?? {},
    dayPlans: (first.serviceReportStore.dayPlans ?? []) as DayPlan[],
    recurringPlans: (first.serviceReportStore.recurringPlans ??
      []) as RecurringPlan[],
    deletedServiceReports: first.serviceReportStore.deletedServiceReports ?? [],
    deletedDayPlans: first.serviceReportStore.deletedDayPlans ?? [],
    deletedRecurringPlans: first.serviceReportStore.deletedRecurringPlans ?? [],
    categories: (first.categoryStore?.categories ?? []) as Category[],
    deletedCategories: first.categoryStore?.deletedCategories ?? [],
    ...mileageFromPayload(first),
    ...petFromPayload(first),
    preferencesValues: first.preferencesStore?.values ?? {},
    preferenceUpdatedAt: first.preferencesStore?.updatedAt ?? {},
    profileValues: first.profileStore?.values ?? {},
    profileUpdatedAt: first.profileStore?.updatedAt ?? {},
  }

  for (let i = 0; i < payloads.length; i++) {
    const { changed: _changed, ...next } = mergePayload(acc, payloads[i])
    acc = next
  }

  let rep = payloads[0]
  for (const p of payloads) {
    if (p.writtenAt > rep.writtenAt) rep = p
  }

  return {
    version: rep.version,
    writtenAt: rep.writtenAt,
    deviceId: rep.deviceId,
    deviceName: rep.deviceName,
    ...(rep.resetEpoch ? { resetEpoch: rep.resetEpoch } : {}),
    contactStore: {
      contacts: acc.contacts,
      deletedContacts: acc.deletedContacts,
      customFieldDefs: acc.customFieldDefs,
      deletedCustomFieldDefs: acc.deletedCustomFieldDefs,
    },
    conversationStore: {
      conversations: acc.conversations,
      deletedConversations: acc.deletedConversations,
      conversationFieldDefs: acc.conversationFieldDefs,
      deletedConversationFieldDefs: acc.deletedConversationFieldDefs,
    },
    serviceReportStore: {
      serviceReports: acc.serviceReports,
      dayPlans: acc.dayPlans,
      recurringPlans: acc.recurringPlans,
      deletedServiceReports: acc.deletedServiceReports,
      deletedDayPlans: acc.deletedDayPlans,
      deletedRecurringPlans: acc.deletedRecurringPlans,
    },

    ...(payloads.some((payload) => payload.categoryStore)
      ? {
          categoryStore: {
            categories: acc.categories,
            deletedCategories: acc.deletedCategories,
          },
        }
      : {}),
    ...(payloads.some((payload) => payload.mileageStore)
      ? {
          mileageStore: {
            vehicles: acc.vehicles,
            fuels: acc.fuels,
            fuelPrices: acc.fuelPrices,
            vehicleSetups: acc.vehicleSetups,
            trips: acc.trips,
            deletedMileageRecords: acc.deletedMileageRecords,
          },
        }
      : {}),
    ...(payloads.some((payload) => payload.petStore)
      ? {
          petStore: {
            pets: acc.pets,
            petRooms: acc.petRooms,
            deletedPetRecords: acc.deletedPetRecords,
          },
        }
      : {}),
    preferencesStore: {
      values: acc.preferencesValues,
      updatedAt: acc.preferenceUpdatedAt,
    },
    profileStore: {
      values: acc.profileValues,
      updatedAt: acc.profileUpdatedAt,
    },
  }
}
