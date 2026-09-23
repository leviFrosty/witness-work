import {
  Calendar1 as Calendar1Icon,
  ChevronRight as ChevronRightIcon,
  FileOutput as FileOutputIcon,
  House as HouseIcon,
  LayoutGrid as LayoutGridIcon,
  MessagesSquare as MessagesSquareIcon,
  Route as RouteIcon,
  ShieldCheck as ShieldCheckIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
  Trash2 as Trash2Icon,
  Volume2 as Volume2Icon,
} from 'lucide-react-native'
import Wrapper from '@/components/ui/layout/Wrapper'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import { Alert, Platform, Switch } from 'react-native'
import i18n from '@/lib/locales'
import { useNavigation } from '@react-navigation/native'
import IconButton from '@/components/ui/IconButton'
import { View } from 'react-native'
import { RootStackNavigation } from '@/types/rootStack'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import { usePreferences } from '@/stores/preferences'
import { deleteAllHouseholderData } from '@/stores/householderData'
import useTheme from '@/contexts/theme'

const PreferencesScreen = () => {
  const navigation = useNavigation<RootStackNavigation>()
  const theme = useTheme()
  const { dataProtectionMode, set } = usePreferences()

  // Art 17 erasure affordance: one action that hard-deletes every contact and
  // visit, leaving only redacted sync tombstones.
  const handleDeleteAllHouseholderData = () => {
    Alert.alert(
      i18n.t('dataProtectionDeleteAllTitle'),
      i18n.t('dataProtectionDeleteAllDesc'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('delete'),
          style: 'destructive',
          onPress: () => {
            const { contacts, visits } = deleteAllHouseholderData()
            Alert.alert(
              i18n.t('dataProtectionDeleteAllDoneTitle'),
              i18n.t('dataProtectionDeleteAllDoneDesc', { contacts, visits })
            )
          },
        },
      ]
    )
  }

  // Turning the mode on is always safe; turning it off re-exposes householder
  // fields and features, so confirm first.
  const handleDataProtectionToggle = (value: boolean) => {
    if (value) {
      set({ dataProtectionMode: true, dataProtectionModeSetByUser: true })
      return
    }
    Alert.alert(
      i18n.t('dataProtectionTurnOffTitle'),
      i18n.t('dataProtectionTurnOffDesc'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('dataProtectionTurnOffAction'),
          style: 'destructive',
          onPress: () =>
            set({
              dataProtectionMode: false,
              dataProtectionModeSetByUser: true,
            }),
        },
      ]
    )
  }

  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <KeyboardAwareScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
        >
          <View style={{ gap: 5 }}>
            <SectionTitle text={i18n.t('dataProtectionTitle')} alignWithIcons />
            <Section>
              <InputRowContainer
                leftIcon={ShieldCheckIcon}
                label={i18n.t('dataProtectionSwitchLabel')}
                info={i18n.t('dataProtectionInfoDesc')}
                controlWidth='auto'
                lastInSection={!dataProtectionMode}
                style={{ justifyContent: 'space-between' }}
              >
                <Switch
                  accessibilityLabel={i18n.t('dataProtectionSwitchLabel')}
                  value={dataProtectionMode}
                  onValueChange={handleDataProtectionToggle}
                />
              </InputRowContainer>
              {dataProtectionMode && (
                <InputRowButton
                  leftIcon={Trash2Icon}
                  leftIconColor={theme.colors.error}
                  label={i18n.t('dataProtectionDeleteAll')}
                  onPress={handleDeleteAllHouseholderData}
                  lastInSection
                />
              )}
            </Section>
          </View>
          <View style={{ gap: 5 }}>
            <Section>
              <InputRowButton
                leftIcon={MessagesSquareIcon}
                label={i18n.t('conversations')}
                onPress={() => navigation.navigate('PreferencesConversation')}
              >
                <IconButton icon={ChevronRightIcon} />
              </InputRowButton>
              <InputRowButton
                leftIcon={Calendar1Icon}
                label={i18n.t('plans')}
                onPress={() => navigation.navigate('PreferencesPlans')}
              >
                <IconButton icon={ChevronRightIcon} />
              </InputRowButton>
              <InputRowButton
                leftIcon={RouteIcon}
                label={i18n.t('navigation')}
                onPress={() => navigation.navigate('PreferencesNavigation')}
              >
                <IconButton icon={ChevronRightIcon} />
              </InputRowButton>
              <InputRowButton
                leftIcon={SlidersHorizontalIcon}
                label={i18n.t('contactFields')}
                onPress={() => navigation.navigate('PreferencesCustomFields')}
              >
                <IconButton icon={ChevronRightIcon} />
              </InputRowButton>
              <InputRowButton
                leftIcon={HouseIcon}
                label={i18n.t('homeScreen')}
                onPress={() => navigation.navigate('PreferencesHomeScreen')}
              >
                <IconButton icon={ChevronRightIcon} />
              </InputRowButton>
              <InputRowButton
                leftIcon={Calendar1Icon}
                label={i18n.t('milestoneSecondary_schedule_title')}
                onPress={() => navigation.navigate('PreferencesScheduleScreen')}
              >
                <IconButton icon={ChevronRightIcon} />
              </InputRowButton>
              <InputRowButton
                leftIcon={Volume2Icon}
                label={i18n.t('audioAndHaptics')}
                onPress={() =>
                  navigation.navigate('PreferencesAudioAndHaptics')
                }
              >
                <IconButton icon={ChevronRightIcon} />
              </InputRowButton>
              {Platform.OS === 'ios' && (
                <InputRowButton
                  leftIcon={LayoutGridIcon}
                  label={i18n.t('widgets')}
                  onPress={() => navigation.navigate('PreferencesWidgets')}
                >
                  <IconButton icon={ChevronRightIcon} />
                </InputRowButton>
              )}
              <InputRowButton
                leftIcon={FileOutputIcon}
                label={i18n.t('backups')}
                onPress={() => navigation.navigate('PreferencesBackups')}
                lastInSection
              >
                <IconButton icon={ChevronRightIcon} />
              </InputRowButton>
            </Section>
          </View>
        </KeyboardAwareScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}

export default PreferencesScreen
