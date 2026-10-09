import type { ComponentType } from 'react'
import i18n from '@/lib/locales'
import { syncKey } from '@/lib/syncCopy'
import { useNotesImportEnabled } from '@/hooks/useNotesImportEnabled'
import { RootStackParamList } from '@/types/rootStack'

const NotesImportHeaderRight = () => {
  const enabled = useNotesImportEnabled()
  if (!enabled) return null
  const NotesImportHeaderActions: ComponentType =
    require('@/features/notes-import/components/NotesImportHeaderActions').default
  return <NotesImportHeaderActions />
}

type SettingsDetailScreen = {
  name: keyof RootStackParamList
  /** Required on first open, so launch doesn't load every settings screen. */
  getComponent: () => ComponentType
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
    getComponent: () =>
      require('@/features/settings/screens/preferences/PreferencesScreen')
        .default,
    title: () => i18n.t('preferences'),
  },
  {
    name: 'Whats New',
    getComponent: () =>
      require('@/features/updates/screens/WhatsNewScreen').default,
    title: () => i18n.t('whatsNew'),
  },
  {
    name: 'Import and Export',
    getComponent: () =>
      require('@/features/settings/screens/ImportAndExportScreen').default,
    title: () => i18n.t('importAndExport'),
  },
  {
    name: 'MytimeImport',
    getComponent: () =>
      require('@/features/mytime-import/screens/MytimeImportScreen').default,
    title: () => i18n.t('mytimeImport'),
  },
  {
    name: 'NotesImportComposer',
    getComponent: () =>
      require('@/app/navigation/NotesImportComposerRouteScreen').default,
    title: () => i18n.t('notesImport_title'),
    headerRight: NotesImportHeaderRight,
  },
  {
    name: 'PreferencesPublisher',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesPublisherScreen')
        .default,
    title: () => i18n.t('profileEditTitle'),
  },
  {
    name: 'PreferencesCalendar',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesCalendarScreen')
        .default,
    title: () => i18n.t('calendarSync'),
  },
  {
    name: 'PreferencesConversation',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesConversationScreen')
        .default,
    title: () => i18n.t('conversations'),
  },
  {
    name: 'PreferencesPlans',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesPlansScreen')
        .default,
    title: () => i18n.t('plans'),
  },
  {
    name: 'PreferencesCustomFields',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesCustomFieldsScreen')
        .default,
    title: () => i18n.t('contactFields'),
  },
  {
    name: 'PreferencesConversationFields',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesConversationFieldsScreen')
        .default,
    title: () => i18n.t('conversationFields'),
  },
  {
    name: 'PreferencesNavigation',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesNavigationScreen')
        .default,
    title: () => i18n.t('navigation'),
  },
  {
    name: 'PreferencesAudioAndHaptics',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesAudioAndHapticsScreen')
        .default,
    title: () => i18n.t('audioAndHaptics'),
  },
  {
    name: 'PreferencesTabOrder',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesTabOrderScreen')
        .default,
    title: () => i18n.t('tabOrder'),
  },
  {
    name: 'PreferencesHomeScreen',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesHomeScreen')
        .default,
    title: () => i18n.t('homeScreen'),
  },
  {
    name: 'PreferencesScheduleScreen',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesScheduleScreen')
        .default,
    title: () => i18n.t('milestoneSecondary_schedule_title'),
  },
  {
    name: 'PreferencesBackups',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesBackupsScreen')
        .default,
    title: () => i18n.t('backups'),
  },
  {
    name: 'PreferencesAppearance',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesAppearanceScreen')
        .default,
    title: () => i18n.t('regionAndFormats'),
  },
  {
    name: 'PreferencesPersonalization',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesPersonalizationScreen')
        .default,
    title: () => i18n.t('personalization'),
  },
  {
    name: 'PreferencesWidgets',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesWidgetsScreen')
        .default,
    title: () => i18n.t('widgets'),
  },
  {
    name: 'PreferencesPrivacy',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesPrivacyScreen')
        .default,
    title: () => i18n.t('privacy'),
  },
  {
    name: 'PreferencesiCloud',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesiCloudScreen')
        .default,
    title: () => i18n.t(syncKey('iCloudSync')),
  },
  {
    name: 'PreferencesiCloudDevices',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesiCloudDevicesScreen')
        .default,
    title: () => i18n.t('iCloudDevices'),
  },
  {
    name: 'PreferencesAppIcon',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesAppIconScreen')
        .default,
    title: () => i18n.t('appIconScreenTitle'),
  },
  {
    name: 'PreferencesColorKey',
    getComponent: () =>
      require('@/features/settings/screens/preferences/screens/PreferencesColorKeyScreen')
        .default,
    title: () => i18n.t('colorKeyScreenTitle'),
  },
  {
    name: 'ShareApp',
    getComponent: () =>
      require('@/features/settings/screens/ShareAppScreen').default,
    title: () => i18n.t('shareApp_title'),
  },
  {
    name: 'OpenSourceLicenses',
    getComponent: () =>
      require('@/features/settings/screens/OpenSourceLicensesScreen').default,
    title: () => i18n.t('openSourceLicenses'),
  },
  {
    name: 'FAQ',
    getComponent: () => require('@/features/updates/screens/FAQScreen').default,
    title: () => i18n.t('helpCenter'),
  },
  {
    name: 'More',
    getComponent: () =>
      require('@/features/settings/screens/MoreScreen').default,
    title: () => i18n.t('more'),
  },
]
