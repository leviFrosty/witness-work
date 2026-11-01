import { mergePayload, type MergeResult } from '@/app/sync/merge'
import type { SyncPayload } from '@/app/sync/payload'
import {
  applyMileageSnapshot,
  localMileageSnapshot,
} from '@/app/sync/mileageStoreSync'
import { applyPetSnapshot, localPetSnapshot } from '@/app/sync/petStoreSync'
import { migrateNormalizeDates } from '@/lib/normalizeDate'
import { withRemoteDataMutation } from '@/lib/remoteDataMutation'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'

export type LocalMergeState = Omit<MergeResult, 'changed'>

export function localMergeState(): LocalMergeState {
  const contactsState = useContacts.getState()
  const conversationsState = useConversations.getState()
  const serviceReportState = useServiceReport.getState()
  const categoriesState = useCategories.getState()
  const preferencesState = usePreferences.getState()
  const profileState = useProfile.getState()

  const localPrefValues: Record<string, any> = {}
  for (const [key, value] of Object.entries(preferencesState)) {
    if (typeof value === 'function') continue
    localPrefValues[key] = value
  }

  const localProfileValues: Record<string, any> = {}
  for (const [key, value] of Object.entries(profileState)) {
    if (typeof value === 'function') continue
    localProfileValues[key] = value
  }

  return {
    contacts: contactsState.contacts,
    deletedContacts: contactsState.deletedContacts,
    customFieldDefs: contactsState.customFieldDefs,
    deletedCustomFieldDefs: contactsState.deletedCustomFieldDefs,
    conversations: conversationsState.conversations,
    deletedConversations: conversationsState.deletedConversations,
    conversationFieldDefs: conversationsState.conversationFieldDefs,
    deletedConversationFieldDefs:
      conversationsState.deletedConversationFieldDefs,
    serviceReports: serviceReportState.serviceReports,
    dayPlans: serviceReportState.dayPlans,
    recurringPlans: serviceReportState.recurringPlans,
    deletedServiceReports: serviceReportState.deletedServiceReports,
    deletedDayPlans: serviceReportState.deletedDayPlans,
    deletedRecurringPlans: serviceReportState.deletedRecurringPlans,
    categories: categoriesState.categories,
    deletedCategories: categoriesState.deletedCategories,
    ...localMileageSnapshot(),
    ...localPetSnapshot(),
    preferencesValues: localPrefValues,
    preferenceUpdatedAt: preferencesState.preferenceUpdatedAt ?? {},
    profileValues: localProfileValues,
    profileUpdatedAt: profileState.profileUpdatedAt ?? {},
  }
}

export function mergePayloadsInto(
  local: LocalMergeState,
  payloads: SyncPayload[]
): { changed: boolean; merged: LocalMergeState } {
  let acc = local
  let changed = false
  for (const payload of payloads) {
    const result = mergePayload(acc, payload)
    if (result.changed) changed = true
    const { changed: _changed, ...next } = result
    acc = next
  }
  return { changed, merged: acc }
}

export function applyMergedState(acc: LocalMergeState): void {
  useContacts.getState().set({
    contacts: acc.contacts,
    deletedContacts: acc.deletedContacts,
    customFieldDefs: acc.customFieldDefs,
    deletedCustomFieldDefs: acc.deletedCustomFieldDefs,
  })
  useConversations.getState().set({
    conversations: acc.conversations,
    deletedConversations: acc.deletedConversations,
    conversationFieldDefs: acc.conversationFieldDefs,
    deletedConversationFieldDefs: acc.deletedConversationFieldDefs,
  })
  const normalizedAcc = migrateNormalizeDates({
    serviceReports: acc.serviceReports,
    dayPlans: acc.dayPlans,
    recurringPlans: acc.recurringPlans,
  })
  withRemoteDataMutation(() =>
    useServiceReport.getState().set({
      serviceReports: normalizedAcc.serviceReports,
      dayPlans: normalizedAcc.dayPlans,
      recurringPlans: normalizedAcc.recurringPlans,
      deletedServiceReports: acc.deletedServiceReports,
      deletedDayPlans: acc.deletedDayPlans,
      deletedRecurringPlans: acc.deletedRecurringPlans,
    })
  )
  useCategories.getState().set({
    categories: acc.categories,
    deletedCategories: acc.deletedCategories,
  })
  applyMileageSnapshot(acc)
  applyPetSnapshot(acc)
  usePreferences.setState({
    ...(acc.preferencesValues as any),
    preferenceUpdatedAt: acc.preferenceUpdatedAt,
  })
  useProfile.setState({
    ...(acc.profileValues as any),
    profileUpdatedAt: acc.profileUpdatedAt,
  })
}
