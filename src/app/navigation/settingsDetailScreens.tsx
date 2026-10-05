import type { ComponentType } from 'react'
import i18n from '@/lib/locales'
import { useNotesImportEnabled } from '@/features/notes-import/hooks/useNotesImportEnabled'
import NotesImportHeaderActions from '@/features/notes-import/components/NotesImportHeaderActions'
import NotesImportComposerRouteScreen from '@/app/navigation/NotesImportComposerRouteScreen'
import PreferencesScreen from '@/features/settings/screens/preferences/PreferencesScreen'
import WhatsNewScreen from '@/features/updates/screens/WhatsNewScreen'
import FAQScreen from '@/features/updates/screens/FAQScreen'
import ImportAndExportScreen from '@/features/settings/screens/ImportAndExportScreen'
import MoreScreen from '@/features/settings/screens/MoreScreen'
import ShareAppScreen from '@/features/settings/screens/ShareAppScreen'
import OpenSourceLicensesScreen from '@/features/settings/screens/OpenSourceLicensesScreen'
import MytimeImportScreen from '@/features/mytime-import/screens/MytimeImportScreen'
import PreferencesPublisherScreen from '@/features/settings/screens/preferences/screens/PreferencesPublisherScreen'
import PreferencesCalendarScreen from '@/features/settings/screens/preferences/screens/PreferencesCalendarScreen'
import PreferencesConversationScreen from '@/features/settings/screens/preferences/screens/PreferencesConversationScreen'
import PreferencesPlansScreen from '@/features/settings/screens/preferences/screens/PreferencesPlansScreen'
import PreferencesNavigationScreen from '@/features/settings/screens/preferences/screens/PreferencesNavigationScreen'
import PreferencesAudioAndHapticsScreen from '@/features/settings/screens/preferences/screens/PreferencesAudioAndHapticsScreen'
import PreferencesScheduleScreen from '@/features/settings/screens/preferences/screens/PreferencesScheduleScreen'
import PreferencesTabOrderScreen from '@/features/settings/screens/preferences/screens/PreferencesTabOrderScreen'
import PreferencesHomeScreen from '@/features/settings/screens/preferences/screens/PreferencesHomeScreen'
import PreferencesBackupsScreen from '@/features/settings/screens/preferences/screens/PreferencesBackupsScreen'
import PreferencesAppearanceScreen from '@/features/settings/screens/preferences/screens/PreferencesAppearanceScreen'
import PreferencesPersonalizationScreen from '@/features/settings/screens/preferences/screens/PreferencesPersonalizationScreen'
import PreferencesWidgetsScreen from '@/features/settings/screens/preferences/screens/PreferencesWidgetsScreen'
import PreferencesPrivacyScreen from '@/features/settings/screens/preferences/screens/PreferencesPrivacyScreen'
import PreferencesiCloudScreen from '@/features/settings/screens/preferences/screens/PreferencesiCloudScreen'
import PreferencesiCloudDevicesScreen from '@/features/settings/screens/preferences/screens/PreferencesiCloudDevicesScreen'
import PreferencesAppIconScreen from '@/features/settings/screens/preferences/screens/PreferencesAppIconScreen'
import PreferencesColorKeyScreen from '@/features/settings/screens/preferences/screens/PreferencesColorKeyScreen'
import PreferencesCustomFieldsScreen from '@/features/settings/screens/preferences/screens/PreferencesCustomFieldsScreen'
import PreferencesConversationFieldsScreen from '@/features/settings/screens/preferences/screens/PreferencesConversationFieldsScreen'
import { RootStackParamList } from '@/types/rootStack'

const NotesImportHeaderRight = () =>
  useNotesImportEnabled() ? <NotesImportHeaderActions /> : null

type SettingsDetailScreen = {
  name: keyof RootStackParamList
  component: ComponentType
  title: () => string
  headerRight?: ComponentType
}

/**
 * Routes reachable from the Settings list. Registered on the root stack for
 * compact layouts, and on the wide Settings tab's detail pane so they open
 * beside the list instead of covering it.
 */
export const settingsDetailScreens: SettingsDetailScreen[] = [
  {
    name: 'Preferences',
    component: PreferencesScreen,
    title: () => i18n.t('preferences'),
  },
  {
    name: 'Whats New',
    component: WhatsNewScreen,
    title: () => i18n.t('whatsNew'),
  },
  {
    name: 'Import and Export',
    component: ImportAndExportScreen,
    title: () => i18n.t('importAndExport'),
  },
  {
    name: 'MytimeImport',
    component: MytimeImportScreen,
    title: () => i18n.t('mytimeImport'),
  },
  {
    name: 'NotesImportComposer',
    component: NotesImportComposerRouteScreen,
    title: () => i18n.t('notesImport_title'),
    headerRight: NotesImportHeaderRight,
  },
  {
    name: 'PreferencesPublisher',
    component: PreferencesPublisherScreen,
    title: () => i18n.t('profileEditTitle'),
  },
  {
    name: 'PreferencesCalendar',
    component: PreferencesCalendarScreen,
    title: () => i18n.t('calendarSync'),
  },
  {
    name: 'PreferencesConversation',
    component: PreferencesConversationScreen,
    title: () => i18n.t('conversations'),
  },
  {
    name: 'PreferencesPlans',
    component: PreferencesPlansScreen,
    title: () => i18n.t('plans'),
  },
  {
    name: 'PreferencesCustomFields',
    component: PreferencesCustomFieldsScreen,
    title: () => i18n.t('contactFields'),
  },
  {
    name: 'PreferencesConversationFields',
    component: PreferencesConversationFieldsScreen,
    title: () => i18n.t('conversationFields'),
  },
  {
    name: 'PreferencesNavigation',
    component: PreferencesNavigationScreen,
    title: () => i18n.t('navigation'),
  },
  {
    name: 'PreferencesAudioAndHaptics',
    component: PreferencesAudioAndHapticsScreen,
    title: () => i18n.t('audioAndHaptics'),
  },
  {
    name: 'PreferencesTabOrder',
    component: PreferencesTabOrderScreen,
    title: () => i18n.t('tabOrder'),
  },
  {
    name: 'PreferencesHomeScreen',
    component: PreferencesHomeScreen,
    title: () => i18n.t('homeScreen'),
  },
  {
    name: 'PreferencesScheduleScreen',
    component: PreferencesScheduleScreen,
    title: () => i18n.t('milestoneSecondary_schedule_title'),
  },
  {
    name: 'PreferencesBackups',
    component: PreferencesBackupsScreen,
    title: () => i18n.t('backups'),
  },
  {
    name: 'PreferencesAppearance',
    component: PreferencesAppearanceScreen,
    title: () => i18n.t('regionAndFormats'),
  },
  {
    name: 'PreferencesPersonalization',
    component: PreferencesPersonalizationScreen,
    title: () => i18n.t('personalization'),
  },
  {
    name: 'PreferencesWidgets',
    component: PreferencesWidgetsScreen,
    title: () => i18n.t('widgets'),
  },
  {
    name: 'PreferencesPrivacy',
    component: PreferencesPrivacyScreen,
    title: () => i18n.t('privacy'),
  },
  {
    name: 'PreferencesiCloud',
    component: PreferencesiCloudScreen,
    title: () => i18n.t('iCloudSync'),
  },
  {
    name: 'PreferencesiCloudDevices',
    component: PreferencesiCloudDevicesScreen,
    title: () => i18n.t('iCloudDevices'),
  },
  {
    name: 'PreferencesAppIcon',
    component: PreferencesAppIconScreen,
    title: () => i18n.t('appIconScreenTitle'),
  },
  {
    name: 'PreferencesColorKey',
    component: PreferencesColorKeyScreen,
    title: () => i18n.t('colorKeyScreenTitle'),
  },
  {
    name: 'ShareApp',
    component: ShareAppScreen,
    title: () => i18n.t('shareApp_title'),
  },
  {
    name: 'OpenSourceLicenses',
    component: OpenSourceLicensesScreen,
    title: () => i18n.t('openSourceLicenses'),
  },
  { name: 'FAQ', component: FAQScreen, title: () => i18n.t('helpCenter') },
  { name: 'More', component: MoreScreen, title: () => i18n.t('more') },
]
