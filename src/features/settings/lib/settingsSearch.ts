import Fuse from 'fuse.js'
import i18n, { type TranslationKey } from '@/lib/locales'
import { foldArabicForSearch } from '@/lib/searchNormalize'
import type { RootStackParamList } from '@/types/rootStack'

export type SettingsSearchPage =
  | 'SettingsRoot'
  | Extract<
      keyof RootStackParamList,
      | 'PreferencesPublisher'
      | 'Account'
      | 'PreferencesiCloud'
      | 'PreferencesPersonalization'
      | 'RoutineSettings'
      | 'Preferences'
      | 'Security'
      | 'Import and Export'
      | 'Import Data'
      | 'More'
      | 'ScribeUsage'
      | 'ScribeMemory'
      | 'ShareApp'
      | 'FAQ'
      | 'Whats New'
      | 'OpenSourceLicenses'
      | 'PreferencesAppearance'
      | 'PreferencesConversation'
      | 'PreferencesPlans'
      | 'PreferencesCalendar'
      | 'PreferencesNavigation'
      | 'PreferencesMap'
      | 'PreferencesCustomFields'
      | 'PreferencesConversationFields'
      | 'PreferencesTabOrder'
      | 'PreferencesHomeScreen'
      | 'PreferencesScheduleScreen'
      | 'PreferencesStreaksAndBadges'
      | 'PreferencesAudioAndHaptics'
      | 'PreferencesRewards'
      | 'PreferencesWidgets'
      | 'PreferencesPrivacy'
      | 'PreferencesBackups'
      | 'PreferencesColorKey'
      | 'PreferencesAppIcon'
    >

export type SettingsSearchRoute = Exclude<SettingsSearchPage, 'SettingsRoot'>

export type SettingsSearchRequirement =
  | 'ios'
  | 'account'
  | 'deviceSync'
  | 'calendarSync'
  | 'pet'
  | 'scribeOffered'
  | 'scribeOn'
  | 'logHoursChoice'
  | 'logHoursGoal'
  | 'annualGoal'
  | 'creditLimit'
  | 'timeRollover'
  | 'mileage'
  | 'routineOn'
  | 'dataProtection'

export type SettingsSearchAvailability = Readonly<
  Record<SettingsSearchRequirement, boolean>
>

type PageDefinition = {
  title: TranslationKey
  parent?: SettingsSearchRoute
}

export const SETTINGS_SEARCH_PAGES: Readonly<
  Record<SettingsSearchPage, PageDefinition>
> = {
  SettingsRoot: { title: 'settings' },
  PreferencesPublisher: { title: 'profile' },
  Account: { title: 'account_title' },
  PreferencesiCloud: { title: 'syncSettingsTitle' },
  PreferencesPersonalization: { title: 'personalization' },
  RoutineSettings: { title: 'routine.title' },
  Preferences: { title: 'preferences' },
  Security: { title: 'security' },
  'Import and Export': { title: 'backupAndRestore' },
  'Import Data': { title: 'importData' },
  More: { title: 'more' },
  ScribeUsage: { title: 'scribe_name' },
  ScribeMemory: { title: 'scribe_name' },
  ShareApp: { title: 'shareApp_title' },
  FAQ: { title: 'helpCenter' },
  'Whats New': { title: 'whatsNew' },
  OpenSourceLicenses: { title: 'openSourceLicenses' },
  PreferencesAppearance: {
    title: 'regionAndFormats',
    parent: 'Preferences',
  },
  PreferencesConversation: {
    title: 'conversations',
    parent: 'Preferences',
  },
  PreferencesPlans: {
    title: 'plans',
    parent: 'Preferences',
  },
  PreferencesCalendar: {
    title: 'calendarSync',
    parent: 'Preferences',
  },
  PreferencesNavigation: {
    title: 'navigation',
    parent: 'Preferences',
  },
  PreferencesMap: {
    title: 'mapSettings_title',
    parent: 'Preferences',
  },
  PreferencesCustomFields: {
    title: 'contactFields',
    parent: 'Preferences',
  },
  PreferencesConversationFields: {
    title: 'conversationFields',
    parent: 'Preferences',
  },
  PreferencesTabOrder: {
    title: 'tabOrder',
    parent: 'Preferences',
  },
  PreferencesHomeScreen: {
    title: 'homeScreen',
    parent: 'Preferences',
  },
  PreferencesScheduleScreen: {
    title: 'milestoneSecondary_schedule_title',
    parent: 'Preferences',
  },
  PreferencesStreaksAndBadges: {
    title: 'streaksAndBadges',
    parent: 'Preferences',
  },
  PreferencesAudioAndHaptics: {
    title: 'audioAndHaptics',
    parent: 'Preferences',
  },
  PreferencesRewards: {
    title: 'rewards',
    parent: 'Preferences',
  },
  PreferencesWidgets: {
    title: 'widgets',
    parent: 'Preferences',
  },
  PreferencesPrivacy: {
    title: 'privacy',
    parent: 'Preferences',
  },
  PreferencesBackups: {
    title: 'backups',
    parent: 'Preferences',
  },
  PreferencesColorKey: {
    title: 'colorKeyScreenTitle',
    parent: 'PreferencesPersonalization',
  },
  PreferencesAppIcon: {
    title: 'appIconScreenTitle',
    parent: 'PreferencesPersonalization',
  },
}

export type SettingsSearchItem = {
  readonly id: string
  readonly title: TranslationKey
  readonly page: SettingsSearchPage
  readonly keywords?: TranslationKey
  readonly requires?: readonly SettingsSearchRequirement[]
  readonly isPage?: boolean
}

const page = (
  page: SettingsSearchRoute,
  options: Omit<SettingsSearchItem, 'id' | 'page' | 'title' | 'isPage'> & {
    title?: TranslationKey
  } = {}
) =>
  ({
    id: `page:${page}`,
    title: options.title ?? SETTINGS_SEARCH_PAGES[page].title,
    page,
    isPage: true,
    ...(options.keywords ? { keywords: options.keywords } : {}),
    ...(options.requires ? { requires: options.requires } : {}),
  }) as const

export const SETTINGS_SEARCH_ITEMS = [
  {
    id: 'language',
    title: 'language',
    page: 'SettingsRoot',
    keywords: 'settingsSearch.keywords.language',
  },
  {
    id: 'scribeEnabled',
    title: 'scribe_enabledToggle',
    page: 'SettingsRoot',
    keywords: 'settingsSearch.keywords.scribe',
    requires: ['scribeOffered'],
  },

  page('PreferencesPublisher', {
    keywords: 'settingsSearch.keywords.profile',
  }),
  {
    id: 'logHours',
    title: 'logHours',
    page: 'PreferencesPublisher',
    requires: ['logHoursChoice'],
  },
  {
    id: 'logHoursGoal',
    title: 'logHoursGoal',
    page: 'PreferencesPublisher',
    keywords: 'settingsSearch.keywords.goal',
    requires: ['logHoursGoal'],
  },
  {
    id: 'annualGoal',
    title: 'annualGoal',
    page: 'PreferencesPublisher',
    keywords: 'settingsSearch.keywords.goal',
    requires: ['annualGoal'],
  },
  {
    id: 'defaultExportMethod',
    title: 'defaultExportMethod',
    page: 'PreferencesPublisher',
    keywords: 'settingsSearch.keywords.defaultExportMethod',
  },
  {
    id: 'serviceHistory',
    title: 'serviceHistory.settingsRow',
    page: 'PreferencesPublisher',
    keywords: 'settingsSearch.keywords.serviceHistory',
  },
  {
    id: 'trackMileage',
    title: 'mileage.trackMileage',
    page: 'PreferencesPublisher',
    keywords: 'settingsSearch.keywords.mileage',
  },
  {
    id: 'mileage',
    title: 'mileage.title',
    page: 'PreferencesPublisher',
    keywords: 'settingsSearch.keywords.mileage',
    requires: ['mileage'],
  },
  {
    id: 'monthlyCreditLimit',
    title: 'monthlyMaximumCreditHours',
    page: 'PreferencesPublisher',
    keywords: 'settingsSearch.keywords.credit',
    requires: ['creditLimit'],
  },
  {
    id: 'autoRollover',
    title: 'autoRollover',
    page: 'PreferencesPublisher',
    keywords: 'settingsSearch.keywords.rollover',
    requires: ['timeRollover'],
  },
  {
    id: 'rolloverCredit',
    title: 'rolloverIncludesCredit',
    page: 'PreferencesPublisher',
    keywords: 'settingsSearch.keywords.rollover',
    requires: ['timeRollover'],
  },

  page('Account', {
    keywords: 'settingsSearch.keywords.account',
    requires: ['account'],
  }),
  page('PreferencesiCloud', {
    keywords: 'settingsSearch.keywords.deviceSync',
    requires: ['deviceSync'],
  }),

  page('PreferencesPersonalization'),
  {
    id: 'colorScheme',
    title: 'colorScheme',
    page: 'PreferencesPersonalization',
    keywords: 'settingsSearch.keywords.colorScheme',
  },
  {
    id: 'fontSize',
    title: 'fontSizeOffset',
    page: 'PreferencesPersonalization',
    keywords: 'settingsSearch.keywords.fontSize',
  },
  page('PreferencesColorKey', {
    keywords: 'settingsSearch.keywords.colorKey',
  }),
  {
    id: 'colorKeyRecentDays',
    title: 'colorKey_recentDays',
    page: 'PreferencesColorKey',
    keywords: 'settingsSearch.keywords.colorKey',
  },
  {
    id: 'colorKeyStaleDays',
    title: 'colorKey_staleDays',
    page: 'PreferencesColorKey',
    keywords: 'settingsSearch.keywords.colorKey',
  },
  page('PreferencesAppIcon', { requires: ['ios'] }),

  page('RoutineSettings', { keywords: 'settingsSearch.keywords.routine' }),
  {
    id: 'routineReminder',
    title: 'settingsSearch.titles.routineReminder',
    page: 'RoutineSettings',
    keywords: 'settingsSearch.keywords.reminder',
    requires: ['routineOn'],
  },

  page('Preferences'),
  page('PreferencesAppearance', {
    keywords: 'settingsSearch.keywords.regionAndFormats',
  }),
  {
    id: 'durationFormat',
    title: 'durationFormat',
    page: 'PreferencesAppearance',
    keywords: 'settingsSearch.keywords.durationFormat',
  },
  {
    id: 'formatRegion',
    title: 'formatRegion',
    page: 'PreferencesAppearance',
  },
  {
    id: 'startOfWeek',
    title: 'startOfWeek',
    page: 'PreferencesAppearance',
    keywords: 'settingsSearch.keywords.startOfWeek',
  },
  {
    id: 'clockFormat',
    title: 'clockFormat',
    page: 'PreferencesAppearance',
    keywords: 'settingsSearch.keywords.clockFormat',
  },
  {
    id: 'dateOrder',
    title: 'dateOrder',
    page: 'PreferencesAppearance',
  },

  page('PreferencesConversation'),
  {
    id: 'followUpOffset',
    title: 'followUpOffset',
    page: 'PreferencesConversation',
    keywords: 'settingsSearch.keywords.followUp',
  },
  {
    id: 'conversationNotification',
    title: 'settingsSearch.titles.conversationNotification',
    page: 'PreferencesConversation',
    keywords: 'settingsSearch.keywords.reminder',
  },
  {
    id: 'conversationAlwaysNotify',
    title: 'alwaysNotify',
    page: 'PreferencesConversation',
    keywords: 'settingsSearch.keywords.reminder',
  },
  {
    id: 'autoFillAddress',
    title: 'autoFillAddressFromLastContact',
    page: 'PreferencesConversation',
  },

  page('PreferencesPlans'),
  {
    id: 'planNotification',
    title: 'settingsSearch.titles.planNotification',
    page: 'PreferencesPlans',
    keywords: 'settingsSearch.keywords.reminder',
  },
  {
    id: 'planAlwaysNotify',
    title: 'planAlwaysNotify',
    page: 'PreferencesPlans',
    keywords: 'settingsSearch.keywords.reminder',
  },
  {
    id: 'meetingDays',
    title: 'routine.meetings.title',
    page: 'PreferencesPlans',
    keywords: 'settingsSearch.keywords.meetingDays',
  },
  {
    id: 'availability',
    title: 'availability.settingsRow',
    page: 'PreferencesPlans',
  },
  {
    id: 'unloggedDayReminder',
    title: 'unloggedDayReminders',
    page: 'PreferencesPlans',
    keywords: 'settingsSearch.keywords.reminder',
  },
  {
    id: 'monthReportReminder',
    title: 'monthReportReminders',
    page: 'PreferencesPlans',
    keywords: 'settingsSearch.keywords.reportReminder',
  },
  {
    id: 'weekPlanReminder',
    title: 'weekPlanReminder',
    page: 'PreferencesPlans',
    keywords: 'settingsSearch.keywords.reminder',
  },

  page('PreferencesCalendar', {
    keywords: 'settingsSearch.keywords.calendarSync',
    requires: ['calendarSync'],
  }),
  page('PreferencesNavigation', {
    keywords: 'settingsSearch.keywords.navigation',
  }),
  page('PreferencesMap', { keywords: 'settingsSearch.keywords.map' }),
  page('PreferencesCustomFields', {
    keywords: 'settingsSearch.keywords.customFields',
  }),
  page('PreferencesConversationFields', {
    keywords: 'settingsSearch.keywords.customFields',
  }),
  page('PreferencesTabOrder', { keywords: 'settingsSearch.keywords.tabOrder' }),

  page('PreferencesHomeScreen'),
  {
    id: 'hideDonateHeart',
    title: 'hideDonateHeart',
    page: 'PreferencesHomeScreen',
  },
  {
    id: 'hideSupporterNudge',
    title: 'hideSupporterNudge',
    page: 'PreferencesHomeScreen',
  },

  page('PreferencesScheduleScreen'),

  page('PreferencesStreaksAndBadges'),
  {
    id: 'showStreak',
    title: 'streaks_showSetting',
    page: 'PreferencesStreaksAndBadges',
  },
  {
    id: 'streakReminders',
    title: 'streakReminders',
    page: 'PreferencesStreaksAndBadges',
    keywords: 'settingsSearch.keywords.reminder',
  },
  {
    id: 'showBadges',
    title: 'badges_showSetting',
    page: 'PreferencesStreaksAndBadges',
  },

  page('PreferencesAudioAndHaptics'),
  {
    id: 'playSounds',
    title: 'playSounds',
    page: 'PreferencesAudioAndHaptics',
    keywords: 'settingsSearch.keywords.sounds',
  },
  {
    id: 'haptics',
    title: 'haptics',
    page: 'PreferencesAudioAndHaptics',
    keywords: 'settingsSearch.keywords.haptics',
  },

  page('PreferencesRewards', { requires: ['pet'] }),
  page('PreferencesWidgets', {
    keywords: 'settingsSearch.keywords.widgets',
    requires: ['ios'],
  }),

  page('PreferencesPrivacy'),
  {
    id: 'dataProtection',
    title: 'dataProtectionSwitchLabel',
    page: 'PreferencesPrivacy',
  },
  {
    id: 'deleteHouseholderData',
    title: 'dataProtectionDeleteAll',
    page: 'PreferencesPrivacy',
    requires: ['dataProtection'],
  },
  {
    id: 'anonymousAnalytics',
    title: 'anonymousAnalytics',
    page: 'PreferencesPrivacy',
    keywords: 'settingsSearch.keywords.analytics',
  },

  page('PreferencesBackups'),
  {
    id: 'backupReminder',
    title: 'remindMeToBackup',
    page: 'PreferencesBackups',
    keywords: 'settingsSearch.keywords.reminder',
  },

  page('Security', { keywords: 'settingsSearch.keywords.appLock' }),

  page('Import and Export', {
    keywords: 'settingsSearch.keywords.backup',
  }),
  page('Import Data', { keywords: 'settingsSearch.keywords.importData' }),

  page('More'),
  {
    id: 'recoverContacts',
    title: 'recoverContacts',
    page: 'More',
  },
  {
    id: 'dismissedContacts',
    title: 'dismissedContacts',
    page: 'More',
  },
  {
    id: 'importContact',
    title: 'importContact',
    page: 'More',
  },
  {
    id: 'checkForUpdate',
    title: 'checkForUpdate',
    page: 'More',
  },
  {
    id: 'restartOnboarding',
    title: 'restartOnboarding',
    page: 'More',
  },

  page('ScribeUsage', {
    title: 'settingsSearch.titles.scribeUsage',
    requires: ['scribeOffered', 'scribeOn'],
  }),
  page('ScribeMemory', {
    title: 'settingsSearch.titles.scribeMemory',
    requires: ['scribeOffered', 'scribeOn'],
  }),

  page('ShareApp'),
  page('FAQ'),
  page('Whats New'),
  page('OpenSourceLicenses'),
] as const satisfies readonly SettingsSearchItem[]

export type SettingsSearchItemId = (typeof SETTINGS_SEARCH_ITEMS)[number]['id']

export function filterAvailableSettingsSearchItems(
  availability: SettingsSearchAvailability,
  items: readonly SettingsSearchItem[] = SETTINGS_SEARCH_ITEMS
): readonly SettingsSearchItem[] {
  return items.filter(
    (item) =>
      !item.requires ||
      item.requires.every((requirement) => availability[requirement])
  )
}

export function settingsSearchPath(
  page: SettingsSearchPage
): SettingsSearchRoute[] {
  if (page === 'SettingsRoot') return []
  const parent = SETTINGS_SEARCH_PAGES[page].parent
  return [...(parent ? settingsSearchPath(parent) : []), page]
}

export function settingsSearchLocation(item: SettingsSearchItem): string[] {
  const path = settingsSearchPath(item.page)
  return (item.isPage ? path.slice(0, -1) : path).map((route) =>
    i18n.t(SETTINGS_SEARCH_PAGES[route].title)
  )
}

export function normalizeSearchText(value: string): string {
  return foldArabicForSearch(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

type SearchEntry = {
  item: SettingsSearchItem
  index: number
  title: string
  location: string
  keywords: string
}

const MIN_FUZZY_QUERY_LENGTH = 3

export function searchSettings(
  query: string,
  items: readonly SettingsSearchItem[] = SETTINGS_SEARCH_ITEMS
): SettingsSearchItem[] {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return []
  const queryTokens = normalizedQuery.split(' ')

  const entries: SearchEntry[] = items.map((item, index) => ({
    item,
    index,
    title: normalizeSearchText(i18n.t(item.title)),
    location: normalizeSearchText(settingsSearchLocation(item).join(' ')),
    keywords: item.keywords ? normalizeSearchText(i18n.t(item.keywords)) : '',
  }))

  const exact = entries
    .flatMap((entry) => {
      const fields = [entry.title, entry.location, entry.keywords]
      if (
        !queryTokens.every((token) =>
          fields.some((field) => field.includes(token))
        )
      )
        return []
      const { title } = entry
      const rank =
        title === normalizedQuery
          ? 5
          : title.startsWith(normalizedQuery)
            ? 4
            : title.includes(normalizedQuery)
              ? 3
              : queryTokens.every((token) => title.includes(token))
                ? 2
                : fields.some((field) => field.includes(normalizedQuery))
                  ? 1
                  : 0
      return [{ entry, rank }]
    })
    .sort(
      (left, right) =>
        right.rank - left.rank || left.entry.index - right.entry.index
    )
    .map(({ entry }) => entry.item)

  if (exact.length > 0 || normalizedQuery.length < MIN_FUZZY_QUERY_LENGTH)
    return exact

  return new Fuse(entries, {
    keys: [
      { name: 'title', weight: 0.6 },
      { name: 'keywords', weight: 0.25 },
      { name: 'location', weight: 0.15 },
    ],
    threshold: 0.3,
    ignoreLocation: true,
    minMatchCharLength: 2,
  })
    .search(normalizedQuery)
    .map((result) => result.item.item)
}
