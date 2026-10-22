export type FAQCategory =
  | 'time'
  | 'contacts'
  | 'plans'
  | 'notes'
  | 'streaks'
  | 'buddies'
  | 'badges'
  | 'mileage'
  | 'pet'
  | 'map'
  | 'customization'
  | 'backups'
  | 'account'
  | 'supporter'
  | 'general'

export type FAQPlatform = 'ios' | 'android'

export interface FAQEntry {
  /** Stable identifier; also forms the i18n key suffix. */
  id: string
  category: FAQCategory
  /** When true, shown in the pinned "Top questions" section. */
  pinned?: boolean
  /** GitHub issue numbers this FAQ was derived from. */
  related?: number[]
  /** Shown only on this platform; omit when the answer applies to both. */
  platform?: FAQPlatform
}

/**
 * The FAQ list rendered on the FAQ screen.
 *
 * Each entry resolves its question/answer text via i18n keys `faq_<id>_q` and
 * `faq_<id>_a`. Add new entries by:
 *
 * 1. Appending an entry here (set `pinned: true` if it should appear at top, and
 *    `platform` if it only applies to iOS or Android).
 * 2. Adding the matching `faq_<id>_q` and `faq_<id>_a` keys to `en-US.json`.
 *
 * The screen is search-friendly, so write the answer to be self-contained.
 */
export const FAQS: FAQEntry[] = [
  { id: 'notesFormatting', category: 'notes' },
  { id: 'notesPhotos', category: 'notes' },
  { id: 'notesSync', category: 'notes' },
  { id: 'tabletSidebar', category: 'customization' },
  { id: 'menuBar', category: 'general', platform: 'ios' },
  { id: 'appLock', category: 'general' },
  { id: 'updateRequired', category: 'general' },
  { id: 'navigationShortcuts', category: 'general', platform: 'ios' },
  { id: 'pointerHover', category: 'general' },
  { id: 'logTimeForDay', category: 'time' },
  {
    id: 'timeRollover',
    category: 'time',
    pinned: true,
    related: [196, 226, 251, 209, 269, 109],
  },
  {
    id: 'bibleStudies',
    category: 'time',
    pinned: true,
    related: [116],
  },
  {
    id: 'iCloudSync',
    category: 'backups',
    pinned: true,
    related: [118],
    platform: 'ios',
  },
  {
    id: 'googleDriveSync',
    category: 'backups',
    pinned: true,
    platform: 'android',
  },
  { id: 'googleDriveSyncPrivacy', category: 'backups', platform: 'android' },
  {
    id: 'googleDriveSyncTroubleshooting',
    category: 'backups',
    platform: 'android',
  },
  { id: 'calendarSetup', category: 'backups', related: [265], platform: 'ios' },
  { id: 'calendarPrivacy', category: 'backups' },
  { id: 'calendarPrimary', category: 'backups', platform: 'ios' },
  { id: 'calendarTroubleshooting', category: 'backups', platform: 'ios' },
  { id: 'calendarDisconnect', category: 'backups' },
  { id: 'calendarAndroid', category: 'backups', platform: 'android' },
  {
    id: 'widgets',
    category: 'general',
    pinned: true,
    related: [273, 247, 222, 229, 214],
    platform: 'ios',
  },
  { id: 'appleWatch', category: 'time', platform: 'ios' },
  { id: 'appleWatchSync', category: 'time', platform: 'ios' },
  { id: 'appleWatchUpNext', category: 'time', platform: 'ios' },
  { id: 'wearOs', category: 'time', platform: 'android' },
  { id: 'wearOsSync', category: 'time', platform: 'android' },
  { id: 'siri', category: 'time', platform: 'ios' },
  {
    id: 'logHoursAsPublisher',
    category: 'time',
    pinned: true,
    related: [162, 287],
  },
  {
    id: 'switchingPioneer',
    category: 'time',
    pinned: true,
    related: [287, 302],
  },
  {
    id: 'submitReport',
    category: 'time',
    pinned: true,
    related: [243, 238, 41],
  },
  { id: 'monthReportReminders', category: 'time' },
  {
    id: 'buddiesOverview',
    category: 'buddies',
    pinned: true,
  },
  { id: 'buddiesAdd', category: 'buddies' },
  { id: 'buddiesInviteTrouble', category: 'buddies' },
  { id: 'buddiesPrivacy', category: 'buddies' },
  { id: 'buddiesPause', category: 'buddies' },
  { id: 'buddiesPerBuddy', category: 'buddies' },
  { id: 'buddiesInvitations', category: 'buddies' },
  { id: 'buddiesAskToJoin', category: 'buddies' },
  { id: 'buddiesJoinRequests', category: 'buddies' },
  { id: 'buddiesNotifications', category: 'buddies' },
  { id: 'buddiesDetail', category: 'buddies' },
  { id: 'buddiesMissingPlans', category: 'buddies' },
  { id: 'buddiesNotSent', category: 'buddies' },
  { id: 'buddiesRemove', category: 'buddies' },
  { id: 'buddiesSuspended', category: 'buddies' },
  { id: 'accountOverview', category: 'account' },
  { id: 'accountHandoff', category: 'account' },
  { id: 'accountHandoffTrouble', category: 'account' },
  { id: 'accountVerification', category: 'account' },
  { id: 'accountRecoveryKey', category: 'account' },
  { id: 'accountRecoveryKeyUse', category: 'account' },
  { id: 'accountActivity', category: 'account' },
  { id: 'badgesOverview', category: 'badges' },
  { id: 'badgesView', category: 'badges' },
  { id: 'badgesMonths', category: 'badges' },
  { id: 'badgesCollections', category: 'badges' },
  { id: 'badgesBuddies', category: 'badges' },
  { id: 'badgesBuddyNews', category: 'badges' },
  { id: 'badgesKeep', category: 'badges' },
  { id: 'mileageStart', category: 'mileage' },
  { id: 'mileageCost', category: 'mileage' },
  { id: 'mileageUnits', category: 'mileage' },
  { id: 'mileageShare', category: 'mileage' },
  { id: 'mileageCars', category: 'mileage' },
  { id: 'mileageChart', category: 'mileage' },
  { id: 'mileageSync', category: 'mileage' },
  { id: 'mileageTurnOff', category: 'mileage' },
  { id: 'petStart', category: 'pet' },
  { id: 'petHearts', category: 'pet' },
  { id: 'petLamp', category: 'pet' },
  { id: 'petRoom', category: 'pet' },
  { id: 'petHats', category: 'pet' },
  { id: 'petSecrets', category: 'pet' },
  { id: 'petChange', category: 'pet' },
  { id: 'petShare', category: 'pet' },
  { id: 'petWidget', category: 'pet' },
  { id: 'petSync', category: 'pet' },
  { id: 'buddiesRestore', category: 'buddies' },
  {
    id: 'remainingHours',
    category: 'time',
    related: [90, 232, 227, 223, 250],
  },
  {
    id: 'goalPacing',
    category: 'time',
    related: [113, 250],
  },
  {
    id: 'dailyPace',
    category: 'time',
    related: [775, 90, 184],
  },
  {
    id: 'serviceYearPace',
    category: 'time',
    related: [250, 196],
  },
  {
    id: 'timeFormat',
    category: 'customization',
    related: [159],
  },
  {
    id: 'weekStart',
    category: 'customization',
    related: [191, 242],
  },
  {
    id: 'darkMode',
    category: 'customization',
    related: [161, 262],
  },
  { id: 'displaySettings', category: 'customization' },
  {
    id: 'appIcon',
    category: 'customization',
    related: [119],
    platform: 'ios',
  },
  {
    id: 'reorderHome',
    category: 'customization',
    related: [119, 259],
  },
  {
    id: 'progressCards',
    category: 'customization',
    related: [775, 119, 259],
  },
  { id: 'progressStats', category: 'customization' },
  { id: 'reorderTabs', category: 'customization' },
  {
    id: 'timerRounding',
    category: 'time',
    related: [156, 127, 258],
  },
  {
    id: 'addNotesToTime',
    category: 'time',
    related: [227],
  },
  {
    id: 'specialPioneerAnnual',
    category: 'time',
    related: [95, 228, 190, 136],
  },
  {
    id: 'ldcCreditCap',
    category: 'time',
    related: [124, 9, 98],
  },
  {
    id: 'timezoneShift',
    category: 'time',
    related: [309, 261],
  },
  { id: 'scheduleViews', category: 'plans' },
  { id: 'planDetails', category: 'plans' },
  { id: 'planJustHours', category: 'plans' },
  {
    id: 'editRecurringPlan',
    category: 'plans',
    related: [165, 105, 107],
  },
  {
    id: 'awayDay',
    category: 'plans',
    related: [105],
  },
  { id: 'multiplePlansOneDay', category: 'plans', related: [547] },
  { id: 'planFirstMonth', category: 'plans' },
  { id: 'logTimeReminders', category: 'plans', related: [203] },
  { id: 'weekPlanReminders', category: 'plans' },
  { id: 'streaks', category: 'streaks' },
  { id: 'streakEnds', category: 'streaks' },
  { id: 'streakBuddies', category: 'streaks' },
  { id: 'streaksHide', category: 'streaks' },
  { id: 'routePlanning', category: 'plans' },
  { id: 'routePlanningPlaces', category: 'plans' },
  { id: 'routePlanningBuddies', category: 'plans' },
  { id: 'routePlanningNavigation', category: 'plans' },
  { id: 'routePlanningPrivacy', category: 'plans' },
  {
    id: 'importContacts',
    category: 'contacts',
    related: [219, 42],
  },
  {
    id: 'importOtherApps',
    category: 'backups',
    related: [280, 42],
  },
  {
    id: 'backupRestore',
    category: 'backups',
    related: [277, 93],
  },
  { id: 'backupRecovery', category: 'backups', related: [433] },
  { id: 'accountBackup', category: 'backups' },
  { id: 'accountBackupPrivacy', category: 'backups' },
  { id: 'accountBackupRestore', category: 'backups' },
  { id: 'accountBackupDelete', category: 'backups' },
  { id: 'cloudSync', category: 'backups', pinned: true },
  { id: 'cloudSyncPrivacy', category: 'backups' },
  { id: 'cloudSyncSwitch', category: 'backups' },
  { id: 'syncTroubleshooting', category: 'backups', related: [118] },
  { id: 'syncPhotos', category: 'backups' },
  { id: 'syncRecovery', category: 'backups' },
  { id: 'syncRemoveDevice', category: 'backups' },
  { id: 'notesImportHelp', category: 'backups', related: [360, 378] },
  { id: 'notesImportPaper', category: 'backups' },
  { id: 'notesImportVoicePhoto', category: 'backups' },
  { id: 'notesImportRetry', category: 'backups' },
  { id: 'notesImportAndroid', category: 'backups', platform: 'android' },
  { id: 'mytimeTrouble', category: 'backups', related: [360] },
  {
    id: 'hourglassSetup',
    category: 'time',
    related: [392, 399, 429],
  },
  { id: 'logVisit', category: 'contacts' },
  { id: 'visitDetails', category: 'contacts' },
  { id: 'followUpCard', category: 'contacts' },
  { id: 'followUpReminders', category: 'contacts', related: [480] },
  { id: 'conversationFields', category: 'contacts', related: [171] },
  { id: 'savedContactViews', category: 'contacts' },
  { id: 'contactsSuggestedSort', category: 'contacts' },
  { id: 'reminders', category: 'contacts' },
  { id: 'appIconBadge', category: 'general' },
  { id: 'soundEffects', category: 'customization', related: [365, 486] },
  { id: 'haptics', category: 'customization' },
  {
    id: 'shareAddress',
    category: 'map',
  },
  {
    id: 'manualPin',
    category: 'map',
    related: [100, 144, 168, 153, 141, 140],
  },
  { id: 'locationTrouble', category: 'map' },
  { id: 'mapFilters', category: 'map' },
  {
    id: 'profilePic',
    category: 'contacts',
    related: [200, 306],
  },
  {
    id: 'dismissContact',
    category: 'contacts',
    related: [150, 43],
  },
  { id: 'deleteContact', category: 'contacts' },
  { id: 'contactStalenessFilter', category: 'contacts' },
  {
    id: 'contactsFollowUpFilter',
    category: 'contacts',
    related: [260, 310, 480],
  },
  {
    id: 'findNavigation',
    category: 'general',
    pinned: true,
  },
  {
    id: 'reportBug',
    category: 'general',
  },
  { id: 'translations', category: 'general' },
  { id: 'arabic', category: 'general' },
  { id: 'about', category: 'general' },
  { id: 'debugTools', category: 'general' },
  {
    id: 'becomeSupporter',
    category: 'supporter',
  },
  { id: 'restoreSupporter', category: 'supporter' },
  { id: 'foundingSupporter', category: 'supporter' },
  {
    id: 'stillFree',
    category: 'supporter',
  },
  {
    id: 'stopSupporting',
    category: 'supporter',
  },
  { id: 'pauseSupport', category: 'supporter' },
  {
    id: 'acceptDonations',
    category: 'supporter',
  },
  {
    id: 'donationsUsedFor',
    category: 'supporter',
  },
  {
    id: 'whatsNew',
    category: 'general',
    related: [33],
  },
  { id: 'notificationsTray', category: 'general' },
  { id: 'shareApp', category: 'general' },
  { id: 'android', category: 'general' },
  { id: 'dataPrivacy', category: 'general' },
]

export const FAQ_CATEGORIES: FAQCategory[] = [
  'time',
  'contacts',
  'plans',
  'notes',
  'streaks',
  'buddies',
  'badges',
  'mileage',
  'pet',
  'map',
  'customization',
  'backups',
  'account',
  'supporter',
  'general',
]

/** The entries shown on `platform`, in list order. */
export const faqsForPlatform = (platform: string): FAQEntry[] =>
  FAQS.filter((entry) => !entry.platform || entry.platform === platform)

/** The categories that have at least one of `entries`, in display order. */
export const faqCategoriesFor = (entries: FAQEntry[]): FAQCategory[] =>
  FAQ_CATEGORIES.filter((category) =>
    entries.some((entry) => entry.category === category)
  )
