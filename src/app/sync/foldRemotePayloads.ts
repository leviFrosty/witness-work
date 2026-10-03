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

type LocalMergeState = Omit<MergeResult, 'changed'>

/**
 * Folds a list of remote payloads into a single synthesized SyncPayload by
 * merging them pairwise via the LWW merge algorithm. Used for
 * `peekRemotePayload` and the manual "restore from iCloud" flow, where the
 * caller expects one payload-shaped object representing the full remote state
 * across all devices.
 *
 * Only payloads from the newest reset generation are folded: older ones are
 * snapshots a reset replaced. The result carries that generation.
 *
 * Returns null when the input is empty.
 */
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
    preferencesValues: first.preferencesStore?.values ?? {},
    preferenceUpdatedAt: first.preferencesStore?.updatedAt ?? {},
    profileValues: first.profileStore?.values ?? {},
    profileUpdatedAt: first.profileStore?.updatedAt ?? {},
  }

  // Normalize the seed too: one-shot restores must apply the same aliases,
  // tombstones and retention policy even when only one peer file is present.
  for (let i = 0; i < payloads.length; i++) {
    const { changed: _changed, ...next } = mergePayload(acc, payloads[i])
    acc = next
  }

  // Representative metadata: pick the payload with the newest writtenAt.
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
    },
    serviceReportStore: {
      serviceReports: acc.serviceReports,
      dayPlans: acc.dayPlans,
      recurringPlans: acc.recurringPlans,
      deletedServiceReports: acc.deletedServiceReports,
      deletedDayPlans: acc.deletedDayPlans,
      deletedRecurringPlans: acc.deletedRecurringPlans,
    },
    categoryStore: {
      categories: acc.categories,
      deletedCategories: acc.deletedCategories,
    },
    mileageStore: {
      vehicles: acc.vehicles,
      fuels: acc.fuels,
      fuelPrices: acc.fuelPrices,
      vehicleSetups: acc.vehicleSetups,
      trips: acc.trips,
      deletedMileageRecords: acc.deletedMileageRecords,
    },
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
