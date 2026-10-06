import moment from 'moment'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import { DayPlan, TimeEntry } from '@/types/timeEntry'
import { Publisher } from '@/types/publisher'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'

/**
 * Named app states for agent verification runs (`scripts/verify`). Pure: every
 * date derives from `now`, so a scenario seeded on any day looks "current" and
 * ids stay stable across reseeds.
 */
export const SCENARIO_NAMES = [
  'fresh',
  'onboarded',
  'publisher',
  'pioneer',
  'busy',
] as const
export type ScenarioName = (typeof SCENARIO_NAMES)[number]

export type Scenario = {
  /** False leaves the app on onboarding (a fresh install). */
  onboarded: boolean
  role: Publisher
  tenureStartDate: Date | null
  profileName: string
  contacts: Contact[]
  visits: Visit[]
  timeEntries: TimeEntry[]
  dayPlans: DayPlan[]
}

export const SCENARIO_ID_PREFIX = 'verify-'

// Apple's default simulator location, so map pins land near the device.
const ORIGIN = { latitude: 37.785834, longitude: -122.406417 }

const CONTACT_NAMES = [
  'Ada Reyes',
  'Bruno Okafor',
  'Chen Wei',
  'Dalia Haddad',
  'Elif Kaya',
  'Farah Siddiqui',
  'Gustavo Lima',
  'Hana Sato',
]

const STREETS = ['Market St', 'Mission St', 'Howard St', 'Folsom St']

function isScenarioName(name: string): name is ScenarioName {
  return (SCENARIO_NAMES as readonly string[]).includes(name)
}

function buildContacts(now: moment.Moment, count: number): Contact[] {
  return Array.from({ length: count }, (_, index) => {
    const baseName = CONTACT_NAMES[index % CONTACT_NAMES.length]
    const round = Math.floor(index / CONTACT_NAMES.length)
    return {
      id: `${SCENARIO_ID_PREFIX}contact-${index}`,
      name: round === 0 ? baseName : `${baseName} ${round + 1}`,
      createdAt: now
        .clone()
        .subtract(index * 9 + 2, 'days')
        .toDate(),
      phone: `+1415555${String(1000 + index).slice(-4)}`,
      address: {
        line1: `${100 + index * 7} ${STREETS[index % STREETS.length]}`,
        city: 'San Francisco',
        state: 'CA',
        zip: '94103',
      },
      coordinate: {
        latitude: ORIGIN.latitude + ((index % 7) - 3) * 0.004,
        longitude: ORIGIN.longitude + ((index % 5) - 2) * 0.005,
      },
      isFavorite: index === 0,
    }
  })
}

/**
 * Two visits per contact. The first three are Bible studies; contact 1 has an
 * overdue follow-up and contact 2 one due in two days, so Home's follow-up
 * sections render.
 */
function buildVisits(now: moment.Moment, contacts: Contact[]): Visit[] {
  return contacts.flatMap((contact, index) =>
    [0, 1].map((visitIndex) => {
      const date = now
        .clone()
        .subtract(index * 3 + visitIndex * 14 + 1, 'days')
        .hour(10)
        .minute(0)
        .second(0)
        .millisecond(0)
      const followUp =
        visitIndex === 0 && index === 1
          ? {
              date: now.clone().subtract(1, 'days').toDate(),
              notifyMe: false,
              topic: 'Bring the brochure',
            }
          : visitIndex === 0 && index === 2
            ? {
                date: now.clone().add(2, 'days').toDate(),
                notifyMe: false,
                topic: 'Continue lesson 3',
              }
            : undefined
      return {
        id: `${SCENARIO_ID_PREFIX}visit-${index}-${visitIndex}`,
        contact: { id: contact.id },
        date: date.toDate(),
        note: visitIndex === 0 ? 'Talked about family' : '',
        isBibleStudy: index < 3,
        followUp,
      }
    })
  )
}

/**
 * Pioneer hours from the start of the service year (September) through
 * yesterday: two entries a week plus one LDC credit entry this month.
 */
function buildPioneerEntries(
  now: moment.Moment,
  serviceYearStart: moment.Moment
): TimeEntry[] {
  const entries: TimeEntry[] = []
  const cursor = serviceYearStart.clone()
  const today = now.clone().startOf('day')
  let index = 0
  while (cursor.isBefore(today)) {
    if (cursor.day() === 2 || cursor.day() === 6) {
      entries.push({
        id: `${SCENARIO_ID_PREFIX}entry-${index}`,
        date: cursor.clone().hour(9).toDate(),
        hours: cursor.day() === 6 ? 3 : 2,
        minutes: index % 3 === 0 ? 30 : 0,
      })
      index++
    }
    cursor.add(1, 'day')
  }
  entries.push({
    id: `${SCENARIO_ID_PREFIX}entry-ldc`,
    date: moment.min(now.clone().startOf('month').hour(12), now).toDate(),
    hours: 4,
    minutes: 0,
    credit: true,
    categoryId: LDC_BUILTIN_CATEGORY_ID,
  })
  return entries
}

/** A 0h entry is the "shared in the ministry" checkbox for publishers. */
function buildPublisherEntries(now: moment.Moment): TimeEntry[] {
  return [0, 1, 2].map((monthsAgo) => ({
    id: `${SCENARIO_ID_PREFIX}shared-${monthsAgo}`,
    date: moment
      .min(
        now
          .clone()
          .subtract(monthsAgo, 'months')
          .startOf('month')
          .add(3, 'days')
          .hour(12),
        now
      )
      .toDate(),
    hours: 0,
    minutes: 0,
  }))
}

function buildDayPlans(now: moment.Moment): DayPlan[] {
  return [1, 3, 6].map((daysAhead, index) => ({
    id: `${SCENARIO_ID_PREFIX}plan-${index}`,
    date: now.clone().add(daysAhead, 'days').startOf('day').toDate(),
    minutes: 120,
    startTimeInMinutes: 9 * 60 + index * 30,
    title: index === 0 ? 'Cart witnessing' : undefined,
  }))
}

/** Start of the September-to-August service year containing `now`. */
function serviceYearStartFor(now: moment.Moment): moment.Moment {
  const start = now.clone().startOf('month').month(8)
  return now.month() >= 8 ? start : start.subtract(1, 'year')
}

export function buildScenario(
  name: string,
  nowInput: moment.Moment | Date = new Date()
): Scenario {
  if (!isScenarioName(name)) {
    throw new Error(
      `Unknown scenario "${name}". Expected one of: ${SCENARIO_NAMES.join(', ')}`
    )
  }
  const now = moment(nowInput)
  const empty: Scenario = {
    onboarded: name !== 'fresh',
    role: 'publisher',
    tenureStartDate: null,
    profileName: 'Verify',
    contacts: [],
    visits: [],
    timeEntries: [],
    dayPlans: [],
  }
  if (name === 'fresh' || name === 'onboarded') return empty

  if (name === 'publisher') {
    const contacts = buildContacts(now, 4)
    return {
      ...empty,
      contacts,
      visits: buildVisits(now, contacts),
      timeEntries: buildPublisherEntries(now),
    }
  }

  const serviceYearStart = serviceYearStartFor(now)
  const contacts = buildContacts(now, name === 'busy' ? 160 : 8)
  return {
    ...empty,
    role: 'regularPioneer',
    tenureStartDate: serviceYearStart.clone().subtract(2, 'years').toDate(),
    contacts,
    visits: buildVisits(now, contacts),
    timeEntries: buildPioneerEntries(now, serviceYearStart),
    dayPlans: buildDayPlans(now),
  }
}
