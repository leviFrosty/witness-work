export type FAQCategory =
  | 'time'
  | 'contacts'
  | 'plans'
  | 'map'
  | 'customization'
  | 'backups'
  | 'supporter'
  | 'general'

export interface FAQEntry {
  /** Stable identifier; also forms the i18n key suffix. */
  id: string
  category: FAQCategory
  /** When true, shown in the pinned "Top questions" section. */
  pinned?: boolean
  /** Closed GitHub issue numbers this FAQ was derived from. */
  related?: number[]
}

/**
 * The FAQ list rendered on the FAQ screen.
 *
 * Each entry resolves its question/answer text via i18n keys `faq_<id>_q` and
 * `faq_<id>_a`. Add new entries by:
 *
 * 1. Appending an entry here (set `pinned: true` if it should appear at top).
 * 2. Adding the matching `faq_<id>_q` and `faq_<id>_a` keys to `en-US.json`.
 *
 * The screen is search-friendly, so write the answer to be self-contained.
 */
export const FAQS: FAQEntry[] = [
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
  },
  {
    id: 'widgets',
    category: 'general',
    pinned: true,
    related: [273, 247, 222, 229, 214],
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
  {
    id: 'appIcon',
    category: 'customization',
    related: [119],
  },
  {
    id: 'reorderHome',
    category: 'customization',
    related: [119, 259],
  },
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
  {
    id: 'shareAddress',
    category: 'map',
  },
  {
    id: 'manualPin',
    category: 'map',
    related: [100, 144, 168, 153, 141, 140],
  },
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
  {
    id: 'reportBug',
    category: 'general',
  },
  {
    id: 'becomeSupporter',
    category: 'supporter',
  },
  {
    id: 'stillFree',
    category: 'supporter',
  },
  {
    id: 'stopSupporting',
    category: 'supporter',
  },
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
]

export const FAQ_CATEGORIES: FAQCategory[] = [
  'time',
  'contacts',
  'plans',
  'map',
  'customization',
  'backups',
  'supporter',
  'general',
]
