import {
  Calendar1 as Calendar1Icon,
  Coins as CoinsIcon,
  FileOutput as FileOutputIcon,
  Flame as FlameIcon,
  Globe as GlobeIcon,
  House as HouseIcon,
  LayoutGrid as LayoutGridIcon,
  Map as MapIcon,
  PanelBottom as PanelBottomIcon,
  MessagesSquare as MessagesSquareIcon,
  Route as RouteIcon,
  ShieldCheck as ShieldCheckIcon,
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
import { calendarSyncSupported } from '../../../../../modules/calendar-bridge'
import { hasCapability } from '@/lib/platformCapabilities'

const PreferencesScreen = () => {
  const navigation = useNavigation<RootStackNavigation>()
  // Rewards are what the pet earns: nothing to set without one.
  const hasPet = usePet((state) => state.pet !== null)

  return (
    <GroupedList>
      <GroupedListSection>
        <GroupedListRow
          icon={GlobeIcon}
          label={i18n.t('regionAndFormats')}
          onPress={() => navigation.navigate('PreferencesAppearance')}
        />
        <GroupedListRow
          icon={MessagesSquareIcon}
          label={i18n.t('conversations')}
          onPress={() => navigation.navigate('PreferencesConversation')}
        />
        <GroupedListRow
          icon={Calendar1Icon}
          label={i18n.t('plans')}
          onPress={() => navigation.navigate('PreferencesPlans')}
        />
        {hasCapability('calendarBridge') && calendarSyncSupported && (
          <GroupedListRow
            icon={Calendar1Icon}
            label={i18n.t('calendarSync')}
            onPress={() => navigation.navigate('PreferencesCalendar')}
          />
        )}
        <GroupedListRow
          icon={RouteIcon}
          label={i18n.t('navigation')}
          onPress={() => navigation.navigate('PreferencesNavigation')}
        />
        <GroupedListRow
          icon={MapIcon}
          label={i18n.t('mapSettings_title')}
          onPress={() => navigation.navigate('PreferencesMap')}
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
        <GroupedListRow
          icon={PanelBottomIcon}
          label={i18n.t('tabOrder')}
          onPress={() => navigation.navigate('PreferencesTabOrder')}
        />
        <GroupedListRow
          icon={HouseIcon}
          label={i18n.t('homeScreen')}
          onPress={() => navigation.navigate('PreferencesHomeScreen')}
        />
        <GroupedListRow
          icon={Calendar1Icon}
          label={i18n.t('milestoneSecondary_schedule_title')}
          onPress={() => navigation.navigate('PreferencesScheduleScreen')}
        />
        <GroupedListRow
          icon={FlameIcon}
          label={i18n.t('streaksAndBadges')}
          onPress={() => navigation.navigate('PreferencesStreaksAndBadges')}
        />
        <GroupedListRow
          icon={Volume2Icon}
          label={i18n.t('audioAndHaptics')}
          onPress={() => navigation.navigate('PreferencesAudioAndHaptics')}
        />
        {hasPet && (
          <GroupedListRow
            icon={CoinsIcon}
            label={i18n.t('rewards')}
            onPress={() => navigation.navigate('PreferencesRewards')}
          />
        )}
        {hasCapability('homeScreenWidgets') && (
          <GroupedListRow
            icon={LayoutGridIcon}
            label={i18n.t('widgets')}
            onPress={() => navigation.navigate('PreferencesWidgets')}
          />
        )}
        <GroupedListRow
          icon={ShieldCheckIcon}
          label={i18n.t('privacy')}
          onPress={() => navigation.navigate('PreferencesPrivacy')}
        />
        <GroupedListRow
          icon={FileOutputIcon}
          label={i18n.t('backups')}
          onPress={() => navigation.navigate('PreferencesBackups')}
        />
      </GroupedListSection>
    </GroupedList>
  )
}

export default PreferencesScreen
