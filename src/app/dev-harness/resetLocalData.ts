import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Stopwatch from '../../../modules/stopwatch-bridge'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useMileage from '@/stores/mileage'
import useSharedCars from '@/stores/sharedCars'
import { useSharedCarsSession } from '@/stores/sharedCarsSession'
import { forgetDeviceInviteSecrets } from '@/lib/sharedSpaces/deviceInviteSecrets'
import { forgetDeviceSpaceKeys } from '@/lib/sharedSpaces/deviceKeyring'
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
import { clearLegacyLedger } from '@/features/scribe/legacy/notesImportLedger'
import { abortAllTurns, useScribeRuns } from '@/features/scribe/runtime/runs'
import { useScribeConversations } from '@/features/scribe/stores/conversations'
import { useScribeLedger } from '@/features/scribe/stores/ledger'
import { useScribeMemory } from '@/features/scribe/stores/memory'
import { useScribeConsent } from '@/features/scribe/stores/consent'
import { useScribeUsageStore } from '@/features/scribe/stores/usage'
import { useNotificationsTray } from '@/features/notifications/stores/notificationsTray'
import { usePetSeen } from '@/features/pet/stores/petSeen'
import { usePetUnlockNews } from '@/features/pet/stores/petUnlockNews'
import { forgetFoundSecrets } from '@/features/pet/lib/secrets'
import { useStreakCelebration } from '@/features/profile/stores/streakCelebration'
import { useSavedPlaces } from '@/features/route-planning/stores/savedPlaces'
import { useSavedRoutes } from '@/features/route-planning/stores/savedRoutes'

type ResettableStore = {
  getInitialState: () => unknown
  setState: (state: never, replace: true) => void
}

export const RESET_STORES: readonly ResettableStore[] = [
  useBuddies,

  useSharedCars,
  useSharedCarsSession,
  useCategories,
  useSavedPlaces,
  useSavedRoutes,
  useMapFindSkips,
  useGeocodeRetry,
  useNotificationsTray,
  usePetUnlockNews,
  usePetSeen,
  useDevNotifications,
  useStreakCelebration,
  useSplitSheetPreferences,
  useSidebarPreferences,
  useAppLockSettings,
  useTimeCache,

  useCalendarSync,
  useCalendarPublishing,

  useScribeConversations,
  useScribeLedger,
  useScribeMemory,
  useScribeConsent,
  useScribeUsageStore,
  useScribeRuns,
]

export function resetLocalData() {
  clearMmkvStorage()
  void AsyncStorage.clear()
  const setPreferences = usePreferences.getState().set

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
  abortAllTurns()
  for (const store of RESET_STORES)
    store.setState(store.getInitialState() as never, true)

  setPreferences({ ...PREFERENCE_DEFAULTS, iCloudSyncSetByUser: true })

  runTagsToCategoriesMigration()
  runLdcCategoryMigration()
  useBadgeSession.getState().reset()
  useProfile.getState().set({ ...PROFILE_DEFAULTS })
  clearLegacyLedger()
  forgetFoundSecrets()

  forgetDeviceSpaceKeys()

  forgetDeviceInviteSecrets()
  void Stopwatch.reset()
}
