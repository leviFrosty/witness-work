import { useNavigation } from '@react-navigation/native'
import {
  Bell as BellIcon,
  CalendarDays as CalendarDaysIcon,
  Eye as EyeIcon,
  PawPrint as PawPrintIcon,
} from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import IconButton from '@/components/ui/IconButton'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import i18n from '@/lib/locales'
import { hasCapability } from '@/lib/platformCapabilities'
import usePet from '@/stores/pet'
import type { RootStackNavigation } from '@/types/rootStack'
import BuddiesAlertRows from '@/features/buddies/components/BuddiesAlertRows'
import BuddiesNotificationRows from '@/features/buddies/components/BuddiesNotificationRows'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import { ScopedSwitchRow } from '@/features/buddies/components/ScopedSettingRows'
import {
  useBuddySettingsScope,
  useScopedSetting,
} from '@/features/buddies/hooks/useBuddySettingsScope'
import useNotificationPermission from '@/features/buddies/hooks/useNotificationPermission'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export default function BuddiesSettingsRows() {
  const navigation = useNavigation<RootStackNavigation>()
  const { buddy } = useBuddySettingsScope()
  const showOnCalendar = useScopedSetting('showOnCalendar')
  const petVisits = useScopedSetting('petVisits')
  const hasPet = usePet((state) => state.pet !== null)
  const { granted } = useNotificationPermission()
  const notificationsOn = useBuddies((state) => state.notificationsEnabled)
  const notifications = hasCapability('deviceNotifications')

  return (
    <>
      <BuddiesSection>
        <InputRowButton
          leftIcon={EyeIcon}
          label={i18n.t('buddies_sharingTitle')}
          onPress={() =>
            navigation.navigate('Buddies Sharing', {
              inboxId: buddy?.inboxId,
            })
          }
        >
          <IconButton icon={ChevronForwardIcon} />
        </InputRowButton>
        <ScopedSwitchRow
          setting={showOnCalendar}
          leftIcon={CalendarDaysIcon}
          label={i18n.t('buddies_plansOnMyCalendar')}
          info={i18n.t('buddies_showOnCalendarInfo')}
          lastInSection={!hasPet && (!!buddy || !notifications)}
        />
        {hasPet && (
          <ScopedSwitchRow
            setting={petVisits}
            leftIcon={PawPrintIcon}
            label={i18n.t('buddies_petVisits')}
            info={i18n.t('buddies_petVisitsInfo')}
            lastInSection={!!buddy || !notifications}
          />
        )}
        {!buddy && notifications && (
          <BuddiesNotificationRows
            leftIcon={BellIcon}
            label={i18n.t('buddies_notifications')}
          />
        )}
      </BuddiesSection>
      {buddy && notifications && granted && notificationsOn && (
        <BuddiesSection
          title={i18n.t('buddies_notifications')}
          footer={i18n.t('buddies_alertsThisDevice')}
        >
          <BuddiesAlertRows />
        </BuddiesSection>
      )}
    </>
  )
}
