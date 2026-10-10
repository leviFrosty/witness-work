import AsyncStorage from '@react-native-async-storage/async-storage'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useMileage from '@/stores/mileage'
import { useTimeCache } from '@/stores/timeCache'
import { PREFERENCE_DEFAULTS, usePreferences } from '@/stores/preferences'
import { useProfile, PROFILE_DEFAULTS } from '@/stores/profile'
import { mmkvStorage } from '@/stores/mmkv'
import { useBadgeSession } from '@/stores/badgeSession'
import { useCalendarPublishing, useCalendarSync } from '@/stores/calendarSync'

/**
 * Wipes this device's data back to a fresh install (Tools "Reset all" and the
 * verification harness). Never touches iCloud or the calendar; Tools removes
 * published events first (`removeConnectedCalendarEvents`).
 */
export function resetLocalData() {
  const setPreferences = usePreferences.getState().set
  // Lock iCloud sync off + mark setByUser BEFORE wiping local data, otherwise
  // SupporterSyncDefault (App.tsx) sees a supporter with no local records and
  // setByUser=false, calls resolveInitialEnable(), gets `pull`, and restores
  // everything from iCloud — kicking the user back to home instead of
  // onboarding. Re-applied after the defaults reset so the flag survives.
  setPreferences({ iCloudSyncEnabled: false, iCloudSyncSetByUser: true })
  useContacts.getState()._WARNING_forceDeleteContacts()
  useContacts.getState()._WARNING_clearDeleted()
  useServiceReport.getState()._WARNING_forceDeleteServiceReports()
  useServiceReport.getState().set({
    dayPlans: [],
    recurringPlans: [],
    deletedDayPlans: [],
    deletedRecurringPlans: [],
  })
  useConversations.getState()._WARNING_forceDeleteConversations()
  useMileage.getState()._WARNING_forceDeleteMileage()
  useTimeCache.getState().invalidateAllCache()
  // The defaults also clear earned badges, the ledger and the first-pass
  // marker; drop any queued celebration or summary with them.
  setPreferences({ ...PREFERENCE_DEFAULTS, iCloudSyncSetByUser: true })
  useBadgeSession.getState().reset()
  useProfile.getState().set({ ...PROFILE_DEFAULTS })
  // In memory too: a connection left enabled keeps publishing until restart,
  // and its events are orphaned once the reset forgets the destination.
  useCalendarSync.setState(useCalendarSync.getInitialState(), true)
  useCalendarPublishing.setState(useCalendarPublishing.getInitialState(), true)
  mmkvStorage.clearAll()
  void AsyncStorage.clear()
}
