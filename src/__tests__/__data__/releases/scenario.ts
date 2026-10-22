// The made-up records every release fixture in this folder holds, so
// `releaseUpgrade.test.ts` can check them after an upgrade. Dates are local
// wall-clock times in America/Chicago, the time zone the fixtures were written
// in. `releaseFixturesGenerate.test.ts` writes a new release's fixture from
// them.
export const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min)

export const CONTACTS = [
  {
    id: 'c-ada',
    name: 'Ada Lindqvist',
    phone: '6515550142',
    phoneRegionCode: 'US',
    email: 'ada.lindqvist@example.com',
    address: {
      line1: '14 Birch Lane',
      line2: 'Apt 2',
      city: 'Maplewood',
      state: 'MN',
      zip: '55109',
      country: 'US',
    },
    coordinate: { latitude: 45.0122, longitude: -93.0311 },
    createdAt: at(2025, 6, 2, 17, 5),
  },
  {
    id: 'c-bram',
    name: 'Bram Okafor',
    phone: '6515550188',
    phoneRegionCode: 'US',
    address: {
      line1: '902 Larpenteur Ave',
      city: 'Roseville',
      state: 'MN',
      zip: '55113',
      country: 'US',
    },
    coordinate: { latitude: 44.9918, longitude: -93.1502 },
    userDraggedCoordinate: true,
    createdAt: at(2025, 6, 20, 10, 30),
  },
  {
    id: 'c-chen',
    name: 'Chen Wei-Lin',
    email: 'chen.wl@example.com',
    address: {
      line1: '3 Harbor Court',
      city: 'Saint Paul',
      state: 'MN',
      zip: '55101',
      country: 'US',
    },
    createdAt: at(2025, 7, 1, 9, 0),
  },
  {
    id: 'c-dora',
    name: 'Dora Halvorsen',
    address: {
      line1: '77 Elm Street',
      city: 'Maplewood',
      state: 'MN',
      zip: '55109',
    },
    createdAt: at(2025, 7, 15, 14, 45),
  },
  {
    id: 'c-eli',
    name: 'Eli Marsh',
    phone: '6515550101',
    address: { line1: '5 Cedar Row', city: 'Saint Paul', state: 'MN' },
    createdAt: at(2025, 6, 5, 12, 0),
  },
]

export const DELETED_CONTACT_ID = 'c-eli'
export const CUSTOM_FIELD = {
  label: 'Best time to visit',
  contactId: 'c-ada',
  value: 'Evenings after 6',
}
export const DISMISSED = {
  contactId: 'c-chen',
  until: at(2025, 12, 1, 9, 0),
  notificationId: 'notif-dismiss-chen',
}

export const VISITS = [
  {
    id: 'v-ada-1',
    contactId: 'c-ada',
    date: at(2025, 9, 25, 18, 30),
    isBibleStudy: true,
    note: 'Discussed lesson 3. Asked about the resurrection.',
    followUp: {
      date: at(2025, 10, 9, 18, 30),
      notifyMe: true,
      topic: 'Lesson 4',
      notifications: [{ id: 'notif-v-ada-1', date: at(2025, 10, 9, 18, 0) }],
    },
  },
  {
    id: 'v-ada-2',
    contactId: 'c-ada',
    date: at(2025, 9, 11, 18, 0),
    isBibleStudy: true,
    note: 'Lesson 2',
  },
  {
    id: 'v-ada-3',
    contactId: 'c-ada',
    date: at(2025, 8, 28, 17, 45),
    isBibleStudy: false,
    note: 'Left a tract',
  },
  {
    id: 'v-bram-1',
    contactId: 'c-bram',
    date: at(2025, 9, 14, 10, 20),
    isBibleStudy: false,
    notAtHome: true,
  },
  {
    id: 'v-bram-2',
    contactId: 'c-bram',
    date: at(2025, 9, 21, 10, 40),
    isBibleStudy: false,
    note: 'Interested in the brochure',
    followUp: {
      date: at(2025, 10, 12, 10, 0),
      notifyMe: false,
      topic: 'Brochure follow-up',
    },
  },
  {
    id: 'v-chen-1',
    contactId: 'c-chen',
    date: at(2025, 8, 30, 11, 0),
    isBibleStudy: false,
    note: 'Spoke at the door',
  },
  {
    id: 'v-chen-2',
    contactId: 'c-chen',
    date: at(2025, 7, 19, 11, 15),
    isBibleStudy: false,
  },
  {
    id: 'v-eli-1',
    contactId: 'c-eli',
    date: at(2025, 7, 8, 13, 0),
    isBibleStudy: false,
    note: 'Moved away',
  },
]

/** Created then deleted, where the release keeps visit tombstones. */
export const DELETED_VISIT = {
  id: 'v-deleted',
  contactId: 'c-dora',
  date: at(2025, 9, 2, 12, 0),
  isBibleStudy: false,
}

export type Kind = 'plain' | 'khc' | 'bethel' | 'letters' | 'ldc'
export type ScenarioEntry = {
  id: string
  date: Date
  hours: number
  minutes: number
  kind: Kind
  note?: string
}
export const ENTRIES: ScenarioEntry[] = [
  {
    id: 'e-01',
    date: at(2025, 7, 5, 10, 0),
    hours: 2,
    minutes: 30,
    kind: 'plain',
  },
  {
    id: 'e-02',
    date: at(2025, 7, 12, 9, 15),
    hours: 3,
    minutes: 0,
    kind: 'plain',
    note: 'Cart witnessing downtown',
  },
  // Late at night: the next day (and month) in UTC.
  {
    id: 'e-03',
    date: at(2025, 7, 31, 23, 30),
    hours: 1,
    minutes: 45,
    kind: 'plain',
  },
  {
    id: 'e-04',
    date: at(2025, 8, 2, 14, 0),
    hours: 0,
    minutes: 50,
    kind: 'plain',
  },
  {
    id: 'e-05',
    date: at(2025, 8, 16, 8, 0),
    hours: 4,
    minutes: 10,
    kind: 'khc',
    note: 'Roofing',
  },
  {
    id: 'e-06',
    date: at(2025, 8, 20, 7, 30),
    hours: 5,
    minutes: 0,
    kind: 'ldc',
  },
  // Just after midnight.
  {
    id: 'e-07',
    date: at(2025, 9, 1, 0, 15),
    hours: 2,
    minutes: 0,
    kind: 'plain',
  },
  {
    id: 'e-08',
    date: at(2025, 9, 6, 9, 0),
    hours: 3,
    minutes: 20,
    kind: 'plain',
    note: 'Group with the Okafors',
  },
  {
    id: 'e-09',
    date: at(2025, 9, 13, 8, 0),
    hours: 6,
    minutes: 0,
    kind: 'bethel',
  },
  {
    id: 'e-10',
    date: at(2025, 9, 20, 19, 0),
    hours: 1,
    minutes: 5,
    kind: 'letters',
  },
  {
    id: 'e-11',
    date: at(2025, 9, 27, 10, 0),
    hours: 2,
    minutes: 40,
    kind: 'plain',
  },
  {
    id: 'e-12',
    date: at(2025, 10, 4, 9, 30),
    hours: 1,
    minutes: 30,
    kind: 'plain',
  },
]
export const DELETED_ENTRY: ScenarioEntry = {
  id: 'e-deleted',
  date: at(2025, 9, 3, 9, 0),
  hours: 1,
  minutes: 0,
  kind: 'plain',
}

export const CATEGORIES = {
  khc: { id: 'cat-khc', name: 'Kingdom Hall construction', isCredit: true },
  bethel: { id: 'cat-bethel', name: 'Bethel', isCredit: true },
  letters: { id: 'cat-letters', name: 'Letter writing', isCredit: false },
}

export const DAY_PLANS = [
  {
    id: 'p-1',
    date: at(2025, 10, 10, 0, 0),
    minutes: 180,
    note: 'Morning group',
  },
  { id: 'p-2', date: at(2025, 10, 18, 8, 0), minutes: 120 },
  { id: 'p-3', date: at(2025, 9, 30, 0, 0), minutes: 60 },
]
export const DELETED_DAY_PLAN = {
  id: 'p-deleted',
  date: at(2025, 10, 20, 0, 0),
  minutes: 90,
}

// RecurringPlanFrequencies: WEEKLY 0, BI_WEEKLY 1, MONTHLY 2, MONTHLY_BY_WEEKDAY 3
export const RECURRING_PLANS = [
  {
    id: 'r-weekly',
    startDate: at(2025, 9, 2, 0, 0),
    minutes: 120,
    note: 'Tuesday ministry',
    recurrence: { frequency: 0, interval: 1, endDate: null as Date | null },
  },
  {
    id: 'r-first-saturday',
    startDate: at(2025, 8, 2, 0, 0),
    minutes: 240,
    recurrence: {
      frequency: 3,
      interval: 1,
      endDate: at(2025, 12, 31, 0, 0) as Date | null,
      monthlyByWeekdayConfig: { weekday: 6, weekOfMonth: 1 },
    },
  },
  {
    id: 'r-biweekly',
    startDate: at(2025, 9, 5, 0, 0),
    minutes: 60,
    recurrence: { frequency: 1, interval: 1, endDate: null as Date | null },
  },
]
export const RECURRING_OVERRIDE = {
  planId: 'r-weekly',
  date: at(2025, 9, 16, 0, 0),
  minutes: 90,
  note: 'Shorter',
}
export const RECURRING_DELETED_DATE = {
  planId: 'r-weekly',
  date: at(2025, 9, 23, 0, 0),
}

// Device-local stores: settings and bookkeeping kept on this device only,
// outside iCloud and Google Drive sync and the backup file.

export const APP_LOCK = { enabled: true, requireAfter: 300 } as const
export const SIDEBAR = { width: 320, hidden: true }
export const SPLIT_SHEET_RATIO = 0.4

export const CALENDAR_SYNC = {
  enabled: true,
  registered: true,
  destination: {
    id: 'cal-ministry',
    title: 'Ministry',
    account: 'sam.rivera@example.com',
  },
  namespace: 'ns-sam-1',
  includeDetails: true,
  lastSyncedAt: at(2025, 10, 6, 19, 30).getTime(),
  failingSince: null,
  upcomingCount: 2,
  sharedCalendar: { title: 'Ministry', account: 'sam.rivera@example.com' },
  optedOut: false,
  promptAnswered: true,
}

/** The bell's bookkeeping, by notification item id. */
export const TRAY = {
  at: at(2025, 10, 6, 18, 0).getTime(),
  arrivals: ['report:2025-09', 'followUp:v-ada-1', 'buddyBadge:inbox-noor'],
  seen: ['report:2025-09'],
  dismissed: ['followUp:v-bram-1'],
}

export const STREAK_SEEN = { kind: 'months', latest: '2025-09' } as const

/** The day → minutes map the Home cards read, cached. */
export const DAILY_MINUTES = {
  daily: { '2025-09-06': 150, '2025-09-13': 90, '2025-10-04': 120 },
  fingerprint: 'fp-fixture',
}

export const BUDDIES = {
  registeredInboxId: 'inbox-sam',
  deviceId: 'device-sam-phone',
  syncSeq: 42,
  rosterVersion: 7,
  pushRegistrationKey: 'push-key-fixture',
  pushRegisteredAt: at(2025, 10, 1, 9, 0).getTime(),
  /**
   * Active. This User hides their Plans from the calendar and mutes their
   * requests to join on this device.
   */
  noor: {
    inboxId: 'inbox-noor',
    name: 'Noor Haddad',
    nickname: 'Noor H.',
    dhPub: 'dh-pub-noor-fixture',
    inviteSecret: 'invite-secret-noor',
    status: 'active' as const,
    pairedAt: at(2025, 8, 10, 12, 0).getTime(),
    colorIndex: 2,
    color: '#7A4FB5',
  },
  /** Accepted this User's invite; waiting for the confirmation. */
  pip: {
    inboxId: 'inbox-pip',
    name: 'Pip Larsen',
    dhPub: 'dh-pub-pip-fixture',
    inviteSecret: 'invite-secret-pip',
    status: 'awaitingConfirm' as const,
    pairedAt: at(2025, 10, 5, 16, 0).getTime(),
    colorIndex: 3,
    expiresAt: at(2025, 10, 12, 16, 0).getTime(),
  },
  invite: {
    inviteId: 'invite-open',
    secret: 'invite-secret-open',
    createdAt: at(2025, 10, 4, 10, 0).getTime(),
    expiresAt: at(2025, 10, 11, 10, 0).getTime(),
  },
  /** Removed; withdrawing its relay slots is still to finish. */
  removed: {
    inboxId: 'inbox-old',
    dhPub: 'dh-pub-old-fixture',
    inviteSecret: 'invite-secret-old',
    removedAt: at(2025, 9, 1, 12, 0).getTime(),
  },
  /** This User stopped showing their photo to buddies. */
  sharing: { photo: false, updatedAt: at(2025, 9, 2, 8, 0).getTime() },
}

/**
 * Notes Import's history (its own MMKV instance): an import read and waiting to
 * be added, and one still being read.
 */
export const NOTES_IMPORTS = {
  ready: {
    hash: 'hash-ready-fixture',
    notesText: 'Sat 10/4 field service 2h. Visited Lena Park, 8 Oak St.',
    createdAt: at(2025, 10, 5, 14, 0).getTime(),
    parsedAt: at(2025, 10, 5, 14, 1).getTime(),
    viewedAt: at(2025, 10, 5, 14, 2).getTime(),
    result: {
      contacts: [
        {
          tempId: 't-lena',
          name: 'Lena Park',
          address: { line1: '8 Oak St', city: 'Maplewood', state: 'MN' },
        },
      ],
      visits: [
        {
          contactTempId: 't-lena',
          date: '2025-10-04T10:00:00-05:00',
          isBibleStudy: false,
          note: 'Left a tract',
        },
      ],
      timeEntries: [{ date: '2025-10-04', hours: 2, minutes: 0 }],
      categories: [],
      publisher: null,
      warnings: [],
      summary: 'Saturday service',
      assistantMessage: '',
    },
  },
  working: {
    hash: 'hash-working-fixture',
    notesText: 'Sun 10/5 letter writing 1h',
    createdAt: at(2025, 10, 6, 19, 50).getTime(),
    activeRun: { importId: 'import-working', subscribeToken: 'token-fixture' },
  },
}

// Device-local stores since 1.45.

/** A pin lookup that failed twice, waiting to retry. */
export const GEOCODE_RETRY = { contactId: 'c-dora', attempts: 2 }
/** The Map's Find stopped offering to look up this Contact's address. */
export const MAP_FIND_SKIP = { contactId: 'c-chen' }
export const SAVED_PLACES = {
  home: {
    title: 'Home',
    subtitle: '12 Pine Street',
    coordinate: { latitude: 44.98, longitude: -93.1 },
    destination: '12 Pine Street, Saint Paul, MN',
  },
}
export const SAVED_ROUTE = {
  day: '2025-10-10',
  order: ['plan:p-1', 'followUp:v-ada-1'],
  removed: [] as string[],
  added: [],
  stay: { 'plan:p-1': 45 },
  startTimeInMinutes: 9 * 60,
  keepSetTimes: false,
  note: 'Start at the Kingdom Hall',
}

// Scribe AI, since 1.45. Its conversations, the undo records of the Proposals
// the User added, and its last usage snapshot stay on this device; the records
// an added Proposal wrote sync like any.

const scribeMeter = (percentUsed: number, asOf: Date) => ({
  plan: 'free' as const,
  supporterCheckFailed: false,
  windows: [
    {
      id: 'monthly' as const,
      percentUsed,
      resetsAt: at(2025, 11, 1).getTime(),
    },
  ],
  limited: false,
  resetsAt: null,
  asOf: asOf.getTime(),
})

/** The Ref the conversation's context lists for a Contact or Category. */
type ScribeRefOf = (name: string) => string

/** What the User's added Proposal wrote. */
const scribeVisit: (typeof VISITS)[number] = {
  id: 'v-dora-scribe',
  contactId: 'c-dora',
  date: at(2025, 10, 6, 20, 7),
  isBibleStudy: false,
  notAtHome: true,
}
const scribeEntry: ScenarioEntry = {
  id: 'e-scribe',
  date: at(2025, 10, 6, 12, 0),
  hours: 1,
  minutes: 0,
  kind: 'letters',
}
const scribeUsage = scribeMeter(9, at(2025, 10, 6, 20, 20))

/**
 * One Scribe AI conversation, a turn per message, as ww-api's model answered
 * it: its answer, and the write calls it made, naming records by the Refs the
 * context lists. The User added the first turn's Proposal, and unchecked the
 * second's Plan, which still waits for review.
 */
export const SCRIBE = {
  turns: [
    {
      at: at(2025, 10, 6, 20, 5),
      text: "Dora Halvorsen wasn't home this afternoon, and I wrote letters for an hour",
      source: 'voice' as const,
      entry: 'home_orb' as const,
      answer:
        'Dora Halvorsen, not at home, and an hour of letter writing today.',
      calls: (refOf: ScribeRefOf) => [
        {
          callId: 'call_dora',
          name: 'visits_log',
          args: {
            contactRef: refOf('Dora Halvorsen'),
            newContact: null,
            askBetween: null,
            date: '2025-10-06',
            notAtHome: true,
            bibleStudy: false,
            note: null,
            dateSpoken: 'this afternoon',
            followUp: null,
          },
        },
        {
          callId: 'call_letters',
          name: 'time_log',
          args: {
            date: '2025-10-06',
            minutes: 60,
            categoryRef: refOf('Letter writing'),
            newCategory: null,
            note: null,
            dateSpoken: null,
          },
        },
      ],
      inputTokens: 5_210,
      meter: scribeMeter(4, at(2025, 10, 6, 20, 5)),
    },
    {
      at: at(2025, 10, 6, 20, 20),
      text: 'Plan two hours Saturday at 9. I also met Lena Park at 8 Oak Street today and left a tract, going back next Monday',
      source: 'keyboard' as const,
      entry: 'conversation' as const,
      answer:
        'Saturday at 9 for two hours, and Lena Park with a follow-up next Monday.',
      calls: () => [
        {
          callId: 'call_saturday',
          name: 'plans_create',
          args: {
            date: '2025-10-11',
            minutes: 120,
            startMinutes: 9 * 60,
            anytime: false,
            categoryRef: null,
            newCategory: null,
            title: null,
            note: null,
            dateSpoken: 'Saturday',
            timeSpoken: 'at 9',
            withBuddies: null,
            repeats: false,
          },
        },
        {
          callId: 'call_lena',
          name: 'visits_log',
          args: {
            contactRef: null,
            newContact: {
              name: 'Lena Park',
              address: {
                line1: '8 Oak Street',
                city: 'Maplewood',
                state: 'MN',
                zip: null,
                country: null,
              },
              phone: null,
            },
            askBetween: null,
            date: '2025-10-06',
            notAtHome: false,
            bibleStudy: false,
            note: 'Left a tract',
            dateSpoken: 'today',
            followUp: {
              date: '2025-10-13',
              topic: null,
              dateSpoken: 'next Monday',
            },
          },
        },
      ],
      inputTokens: 6_840,
      meter: scribeUsage,
    },
  ],
  /** The first turn's Proposal, added. */
  added: { at: at(2025, 10, 6, 20, 7), visit: scribeVisit, entry: scribeEntry },
  /** When the User unchecked the waiting Proposal's Plan card. */
  uncheckedAt: at(2025, 10, 6, 20, 21),
  /** The usage the last step's meter left. */
  usage: scribeUsage,
}
