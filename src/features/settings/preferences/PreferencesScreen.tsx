import {
  BookOpenCheck as BookOpenCheckIcon,
  Calendar1 as Calendar1Icon,
  CalendarDays as CalendarDaysIcon,
  CalendarSync as CalendarSyncIcon,
  Coins as CoinsIcon,
  Flame as FlameIcon,
  House as HouseIcon,
  LayoutGrid as LayoutGridIcon,
  Map as MapIcon,
  PanelBottom as PanelBottomIcon,
  MessagesSquare as MessagesSquareIcon,
  Route as RouteIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
  Volume2 as Volume2Icon,
} from 'lucide-react-native'
import i18n from '@/lib/locales'
import { useNavigation } from '@react-navigation/native'
import usePet from '@/stores/pet'
import { RootStackNavigation } from '@/types/rootStack'
import {
  GroupedList,
  GroupedListRow,
  GroupedListSection,
} from '@/components/ui/GroupedList'
import { calendarSyncSupported } from '../../../../modules/calendar-bridge'
import { hasCapability } from '@/lib/platformCapabilities'

const PreferencesScreen = () => {
  const navigation = useNavigation<RootStackNavigation>()

  const hasPet = usePet((state) => state.pet !== null)

  return (
    <GroupedList>
      <GroupedListSection>
        <GroupedListRow
          icon={BookOpenCheckIcon}
          label={i18n.t('routine.title')}
          onPress={() => navigation.navigate('RoutineSettings')}
          testID='settings-routine'
        />
      </GroupedListSection>

      <GroupedListSection title={i18n.t('preferences_groupPlans')}>
        <GroupedListRow
          icon={Calendar1Icon}
          label={i18n.t('plans')}
          onPress={() => navigation.navigate('PreferencesPlans')}
        />
        <GroupedListRow
          icon={CalendarDaysIcon}
          label={i18n.t('milestoneSecondary_schedule_title')}
          onPress={() => navigation.navigate('PreferencesScheduleScreen')}
        />
        {hasCapability('calendarBridge') && calendarSyncSupported && (
          <GroupedListRow
            icon={CalendarSyncIcon}
            label={i18n.t('calendarSync')}
            onPress={() => navigation.navigate('PreferencesCalendar')}
          />
        )}
      </GroupedListSection>

      <GroupedListSection title={i18n.t('preferences_groupContacts')}>
        <GroupedListRow
          icon={MessagesSquareIcon}
          label={i18n.t('conversations')}
          onPress={() => navigation.navigate('PreferencesConversation')}
        />
        <GroupedListRow
          icon={SlidersHorizontalIcon}
          label={i18n.t('contactFields')}
          onPress={() => navigation.navigate('PreferencesCustomFields')}
        />
        <GroupedListRow
          icon={SlidersHorizontalIcon}
          label={i18n.t('conversationFields')}
          onPress={() => navigation.navigate('PreferencesConversationFields')}
        />
      </GroupedListSection>

      <GroupedListSection title={i18n.t('preferences_groupMap')}>
        <GroupedListRow
          icon={MapIcon}
          label={i18n.t('mapSettings_title')}
          onPress={() => navigation.navigate('PreferencesMap')}
        />
        <GroupedListRow
          icon={RouteIcon}
          label={i18n.t('navigation')}
          onPress={() => navigation.navigate('PreferencesNavigation')}
        />
      </GroupedListSection>

      <GroupedListSection title={i18n.t('preferences_groupStreaks')}>
        <GroupedListRow
          icon={FlameIcon}
          label={i18n.t('streaksAndBadges')}
          onPress={() => navigation.navigate('PreferencesStreaksAndBadges')}
        />
        {hasPet && (
          <GroupedListRow
            icon={CoinsIcon}
            label={i18n.t('rewards')}
            onPress={() => navigation.navigate('PreferencesRewards')}
          />
        )}
      </GroupedListSection>

      <GroupedListSection title={i18n.t('preferences_groupLayout')}>
        <GroupedListRow
          icon={HouseIcon}
          label={i18n.t('homeScreen')}
          onPress={() => navigation.navigate('PreferencesHomeScreen')}
        />
        <GroupedListRow
          icon={PanelBottomIcon}
          label={i18n.t('tabOrder')}
          onPress={() => navigation.navigate('PreferencesTabOrder')}
        />
        {hasCapability('homeScreenWidgets') && (
          <GroupedListRow
            icon={LayoutGridIcon}
            label={i18n.t('widgets')}
            onPress={() => navigation.navigate('PreferencesWidgets')}
          />
        )}
      </GroupedListSection>

      <GroupedListSection title={i18n.t('preferences_groupGeneral')}>
        <GroupedListRow
          icon={Volume2Icon}
          label={i18n.t('audioAndHaptics')}
          onPress={() => navigation.navigate('PreferencesAudioAndHaptics')}
        />
      </GroupedListSection>
    </GroupedList>
  )
}

export default PreferencesScreen
