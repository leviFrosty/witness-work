import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Stopwatch from '../../../modules/stopwatch-bridge'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useMileage from '@/stores/mileage'
import usePet from '@/stores/pet'
import { PREFERENCE_DEFAULTS, usePreferences } from '@/stores/preferences'
import { useProfile, PROFILE_DEFAULTS } from '@/stores/profile'
import { clearMmkvStorage } from '@/stores/mmkv'
import { useBadgeSession } from '@/stores/badgeSession'
import { useCalendarPublishing, useCalendarSync } from '@/stores/calendarSync'
import useCategories from '@/stores/categories'
import {
  runLdcCategoryMigration,
  runTagsToCategoriesMigration,
} from '@/stores/migrations/categories'
import { useAppLockSettings } from '@/stores/appLock'
import { useGeocodeRetry } from '@/stores/geocodeRetry'
import { useSidebarPreferences } from '@/stores/sidebar'
import { useSplitSheetPreferences } from '@/stores/splitSheet'
import { useTimeCache } from '@/stores/timeCache'
import { useDevNotifications } from '@/app/notifications/devNotifications'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useMapFindSkips } from '@/features/map/stores/mapFindSkips'
import { clearLedger } from '@/features/notes-import/lib/notesImportLedger'
import { useNotesImportManager } from '@/features/notes-import/hooks/useNotesImportManager'
import { useNotificationsTray } from '@/features/notifications/stores/notificationsTray'
import { forgetFoundSecrets } from '@/features/pet/lib/secrets'
import { useStreakCelebration } from '@/features/profile/stores/streakCelebration'
import { useSavedPlaces } from '@/features/route-planning/stores/savedPlaces'
import { useSavedRoutes } from '@/features/route-planning/stores/savedRoutes'

type ResettableStore = {
  getInitialState: () => unknown
  setState: (state: never, replace: true) => void
}

/**
 * Device-local stores a reset puts back to their initial state, in memory as
 * well: clearing MMKV alone leaves the live state, and the store's next write
 * saves it again (a seed kept another run's buddies, and with them a badge).
 * `resetLocalData.test.ts` lists the persisted stores a reset keeps, and why.
 */
export const RESET_STORES: readonly ResettableStore[] = [
  useBuddies,
  useCategories,
  useSavedPlaces,
  useSavedRoutes,
  useMapFindSkips,
  useGeocodeRetry,
  useNotificationsTray,
  useDevNotifications,
  useStreakCelebration,
  useSplitSheetPreferences,
  useSidebarPreferences,
  useAppLockSettings,
  useTimeCache,
  // A connection left enabled keeps publishing until restart, and its events
  // are orphaned once the reset forgets the destination.
  useCalendarSync,
  useCalendarPublishing,
]

/**
 * Wipes this device's data back to a fresh install (Tools "Reset all" and the
 * verification harness). Never touches iCloud or the calendar; Tools removes
 * published events first (`removeConnectedCalendarEvents`). The account key and
 * what belongs to it stay, as they do through a reinstall on iOS: the Keychain
 * seed, the server account's session and backup state, and the Notes Import
 * allowance.
 */
export function resetLocalData() {
  // Storage goes first, so the reset state below (the builtin LDC Category,
  // the migration flags) and whatever a seed writes next are saved. Clearing
  // last dropped them: a seeded device lost its LDC Category on relaunch.
  clearMmkvStorage()
  void AsyncStorage.clear()
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
  usePet.getState()._WARNING_forceDeletePet()
  for (const store of RESET_STORES)
    store.setState(store.getInitialState() as never, true)
  // The defaults also clear earned badges, the ledger and the first-pass
  // marker; drop any queued celebration or summary with them.
  setPreferences({ ...PREFERENCE_DEFAULTS, iCloudSyncSetByUser: true })
  // Seeds the builtin LDC Category again, as a fresh launch does.
  runTagsToCategoriesMigration()
  runLdcCategoryMigration()
  useBadgeSession.getState().reset()
  useProfile.getState().set({ ...PROFILE_DEFAULTS })
  clearLedger()
  useNotesImportManager.getState().hydrate()
  forgetFoundSecrets()
  void Stopwatch.reset()
}
