import { Platform } from 'react-native'
import * as BuddiesKeychain from '../../../../modules/buddies-keychain'
import { calendarSyncSupported } from '../../../../modules/calendar-bridge'
import usePublisher from '@/hooks/usePublisher'
import { useScribeOffered } from '@/hooks/useScribeEnabled'
import { usePreferences } from '@/stores/preferences'
import usePet from '@/stores/pet'
import useDeviceSyncAvailable from '@/features/settings/hooks/useDeviceSyncAvailable'
import {
  filterAvailableSettingsSearchItems,
  type SettingsSearchAvailability,
} from '@/features/settings/lib/settingsSearch'

export default function useAvailableSettingsSearchItems() {
  const deviceSync = useDeviceSyncAvailable()
  const scribeOffered = useScribeOffered()
  const scribeOn = usePreferences((s) => s.scribeAiEnabled)
  const logsHours = usePreferences((s) => s.logsHours)
  const mileage = usePreferences((s) => s.mileageTrackingEnabled === true)
  const pet = usePet((s) => s.pet !== null)
  const routineOn = usePreferences((s) => s.routineEnabled === true)
  const dataProtection = usePreferences((s) => s.dataProtectionMode)
  const { entryMode, canAdjustCreditLimit, showsTimeEntry, monthlyGoalHours } =
    usePublisher('standing')
  const isCheckboxMode = entryMode === 'checkbox'

  const availability: SettingsSearchAvailability = {
    ios: Platform.OS === 'ios',
    account: BuddiesKeychain.isReplaceAvailable(),
    deviceSync,
    calendarSync: calendarSyncSupported,
    pet,
    scribeOffered,
    scribeOn,
    logHoursChoice: isCheckboxMode,
    logHoursGoal: isCheckboxMode && logsHours,
    annualGoal: !isCheckboxMode || (showsTimeEntry && monthlyGoalHours > 0),
    creditLimit: canAdjustCreditLimit,
    timeRollover: showsTimeEntry,
    mileage,
    routineOn,
    dataProtection,
  }

  return filterAvailableSettingsSearchItems(availability)
}
