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
