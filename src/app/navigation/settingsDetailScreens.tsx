import type { ComponentType } from 'react'
import i18n from '@/lib/locales'
import { RootStackParamList } from '@/types/rootStack'

type SettingsDetailScreen = {
  name: keyof RootStackParamList

  getComponent: () => ComponentType
  title: () => string
  headerRight?: ComponentType
}

export const settingsDetailScreens: SettingsDetailScreen[] = [
  {
    name: 'Preferences',
    getComponent: () =>
      require('@/features/settings/preferences/PreferencesScreen').default,
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
    name: 'Import Data',
    getComponent: () =>
      require('@/features/settings/screens/ImportDataScreen').default,
    title: () => i18n.t('importData'),
  },
  {
    name: 'MytimeImport',
    getComponent: () =>
      require('@/features/mytime-import/screens/MytimeImportScreen').default,
    title: () => i18n.t('mytimeImport'),
  },
  {
    name: 'ScribeUsage',
    getComponent: () =>
      require('@/app/navigation/ScribeUsageRouteScreen').default,
    title: () => i18n.t('scribe_usageTitle'),
  },
  {
    name: 'ScribeMemory',
    getComponent: () =>
      require('@/features/scribe/screens/ScribeMemoryScreen').default,
    title: () => i18n.t('scribe_memoryTitle'),
  },
  {
    name: 'PreferencesPublisher',
    getComponent: () =>
      require('@/features/settings/preferences/profile/PreferencesPublisherScreen')
        .default,
    title: () => i18n.t('profileEditTitle'),
  },
  {
    name: 'PreferencesCalendar',
    getComponent: () =>
      require('@/features/settings/preferences/plans/PreferencesCalendarScreen')
        .default,
    title: () => i18n.t('calendarSync'),
  },
  {
    name: 'PreferencesConversation',
    getComponent: () =>
      require('@/features/settings/preferences/contacts/PreferencesConversationScreen')
        .default,
    title: () => i18n.t('conversations'),
  },
  {
    name: 'PreferencesPlans',
    getComponent: () =>
      require('@/features/settings/preferences/plans/PreferencesPlansScreen')
        .default,
    title: () => i18n.t('plans'),
  },
  {
    name: 'PreferencesStreaksAndBadges',
    getComponent: () =>
      require('@/features/settings/preferences/streaks-and-rewards/PreferencesStreaksAndBadgesScreen')
        .default,
    title: () => i18n.t('streaksAndBadges'),
  },
  {
    name: 'PreferencesCustomFields',
    getComponent: () =>
      require('@/features/settings/preferences/contacts/PreferencesCustomFieldsScreen')
        .default,
    title: () => i18n.t('contactFields'),
  },
  {
    name: 'PreferencesConversationFields',
    getComponent: () =>
      require('@/features/settings/preferences/contacts/PreferencesConversationFieldsScreen')
        .default,
    title: () => i18n.t('conversationFields'),
  },
  {
    name: 'PreferencesNavigation',
    getComponent: () =>
      require('@/features/settings/preferences/map/PreferencesNavigationScreen')
        .default,
    title: () => i18n.t('navigation'),
  },
  {
    name: 'PreferencesAudioAndHaptics',
    getComponent: () =>
      require('@/features/settings/preferences/general/PreferencesAudioAndHapticsScreen')
        .default,
    title: () => i18n.t('audioAndHaptics'),
  },
  {
    name: 'PreferencesRewards',
    getComponent: () =>
      require('@/features/settings/preferences/streaks-and-rewards/PreferencesRewardsScreen')
        .default,
    title: () => i18n.t('rewards'),
  },
  {
    name: 'RoutineSettings',
    getComponent: () =>
      require('@/features/settings/preferences/routine/RoutineSettingsScreen')
        .default,
    title: () => i18n.t('routine.title'),
  },
  {
    name: 'PreferencesTabOrder',
    getComponent: () =>
      require('@/features/settings/preferences/home-and-layout/PreferencesTabOrderScreen')
        .default,
    title: () => i18n.t('tabOrder'),
  },
  {
    name: 'PreferencesHomeScreen',
    getComponent: () =>
      require('@/features/settings/preferences/home-and-layout/PreferencesHomeScreen')
        .default,
    title: () => i18n.t('homeScreen'),
  },
  {
    name: 'PreferencesScheduleScreen',
    getComponent: () =>
      require('@/features/settings/preferences/plans/PreferencesScheduleScreen')
        .default,
    title: () => i18n.t('milestoneSecondary_schedule_title'),
  },
  {
    name: 'PreferencesNotifications',
    getComponent: () =>
      require('@/features/settings/preferences/notifications/PreferencesNotificationsScreen')
        .default,
    title: () => i18n.t('notifications'),
  },
  {
    name: 'PreferencesAppearance',
    getComponent: () =>
      require('@/features/settings/preferences/general/PreferencesAppearanceScreen')
        .default,
    title: () => i18n.t('regionAndFormats'),
  },
  {
    name: 'Account',
    getComponent: () =>
      require('@/features/settings/screens/AccountScreen').default,
    title: () => i18n.t('account_title'),
  },
  {
    name: 'Set Up Another Device',
    getComponent: () =>
      require('@/features/settings/screens/SetUpAnotherDeviceScreen').default,
    title: () => i18n.t('handoff_setUp'),
  },
  {
    name: 'Change Account Key',
    getComponent: () =>
      require('@/features/settings/screens/ChangeAccountKeyScreen').default,
    title: () => i18n.t('accountKeyChange_row'),
  },
  {
    name: 'Account Devices',
    getComponent: () =>
      require('@/features/settings/screens/AccountDevicesScreen').default,
    title: () => i18n.t('accountSecurity_devices'),
  },
  {
    name: 'Account Passkeys',
    getComponent: () =>
      require('@/features/settings/screens/AccountPasskeysScreen').default,
    title: () => i18n.t('accountSecurity_passkeys'),
  },
  {
    name: 'Account Activity',
    getComponent: () =>
      require('@/features/settings/screens/AccountActivityScreen').default,
    title: () => i18n.t('accountSecurity_activity'),
  },
  {
    name: 'Sign In With Passkey',
    getComponent: () =>
      require('@/features/settings/screens/SignInWithPasskeyScreen').default,
    title: () => i18n.t('passkeySignIn_title'),
  },
  {
    name: 'Sign In With QR Code',
    getComponent: () =>
      require('@/features/settings/screens/SignInWithQrScreen').default,
    title: () => i18n.t('handoff_signIn'),
  },
  {
    name: 'Sign In on a Computer',
    getComponent: () =>
      require('@/features/settings/screens/SignInOnComputerScreen').default,
    title: () => i18n.t('approval_signIn'),
  },
  {
    name: 'PreferencesPersonalization',
    getComponent: () =>
      require('@/features/settings/preferences/personalization/PreferencesPersonalizationScreen')
        .default,
    title: () => i18n.t('personalization'),
  },
  {
    name: 'PreferencesWidgets',
    getComponent: () =>
      require('@/features/settings/preferences/home-and-layout/PreferencesWidgetsScreen')
        .default,
    title: () => i18n.t('widgets'),
  },
  {
    name: 'PreferencesPrivacy',
    getComponent: () =>
      require('@/features/settings/preferences/general/PreferencesPrivacyScreen')
        .default,
    title: () => i18n.t('privacy'),
  },
  {
    name: 'PreferencesiCloud',
    getComponent: () =>
      require('@/features/settings/preferences/sync/PreferencesiCloudScreen')
        .default,
    title: () => i18n.t('syncSettingsTitle'),
  },
  {
    name: 'PreferencesiCloudDevices',
    getComponent: () =>
      require('@/features/settings/preferences/sync/PreferencesiCloudDevicesScreen')
        .default,
    title: () => i18n.t('iCloudDevices'),
  },
  {
    name: 'PreferencesAppIcon',
    getComponent: () =>
      require('@/features/settings/preferences/personalization/PreferencesAppIconScreen')
        .default,
    title: () => i18n.t('appIconScreenTitle'),
  },
  {
    name: 'PreferencesMap',
    getComponent: () =>
      require('@/features/settings/preferences/map/PreferencesMapScreen')
        .default,
    title: () => i18n.t('mapSettings_title'),
  },
  {
    name: 'PreferencesColorKey',
    getComponent: () =>
      require('@/features/settings/preferences/personalization/PreferencesColorKeyScreen')
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
