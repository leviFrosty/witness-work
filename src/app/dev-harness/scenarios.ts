import moment from 'moment'
import { getServiceYearFromDate, serviceYearBounds } from '@/lib/serviceYear'
import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import {
  DayPlan,
  RecurringPlan,
  RecurringPlanFrequencies,
  TimeEntry,
} from '@/types/timeEntry'
import { Publisher } from '@/types/publisher'
import type { RoleHistory } from '@/lib/roleHistory'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import { buildBadgeHistoryFixture } from '@/app/dev-fixtures/badges'

export const SCENARIO_NAMES = [
  'fresh',
  'onboarded',
  'publisher',
  'pioneer',
  'busy',
  'badges',
  'stress',
] as const
export type ScenarioName = (typeof SCENARIO_NAMES)[number]

export type Scenario = {
  onboarded: boolean
  role: Publisher

  roleHistory: RoleHistory | null
  tenureStartDate: Date | null
  profileName: string
  contacts: Contact[]
  visits: Visit[]
  timeEntries: TimeEntry[]
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]

  submittedReportMonths: string[]
}

export const SCENARIO_ID_PREFIX = 'verify-'

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

const STRESS_CONTACTS = 2000
const STRESS_YEARS = 6

const STRESS_LONG_HISTORY_VISITS = 46
const STRESS_NOTE =
  'Talked about family and how to find peace of mind. Left the brochure and ' +
  'agreed to come back on Saturday morning to read Psalm 37 together. ' +
  'Prefers visits after ten; the side gate is open.'

function buildStressVisits(now: moment.Moment, contacts: Contact[]): Visit[] {
  const days = STRESS_YEARS * 365
  const visitAt = (daysAgo: number, hour: number) =>
    now
      .clone()
      .subtract(daysAgo, 'days')
      .hour(hour)
      .minute(0)
      .second(0)
      .millisecond(0)
      .toDate()
  const visits = contacts.flatMap((contact, index) =>
    [0, 1, 2, 3].map((visitIndex) => {
      const followUp =
        visitIndex === 0 && index % 25 === 0
          ? {
              date: now
                .clone()
                .add((index % 50) - 20, 'days')
                .toDate(),
              notifyMe: false,
              topic: 'Bring the brochure',
            }
          : undefined
      return {
        id: `${SCENARIO_ID_PREFIX}visit-${index}-${visitIndex}`,
        contact: { id: contact.id },
        date: visitAt(
          ((index * 7 + visitIndex * 97) % days) + 1,
          9 + (visitIndex % 4)
        ),
        note:
          visitIndex === 1 && index % 7 === 0
            ? STRESS_NOTE
            : visitIndex === 0
              ? 'Talked about family'
              : '',
        isBibleStudy: index < 40,
        followUp,
      }
    })
  )

  const longHistory = Array.from(
    { length: STRESS_LONG_HISTORY_VISITS },
    (_, index) => ({
      id: `${SCENARIO_ID_PREFIX}visit-long-${index}`,
      contact: { id: contacts[0].id },
      date: visitAt(index * 7 + 3, 18),
      note: index % 2 === 0 ? STRESS_NOTE : 'Lesson continued',
      isBibleStudy: true,
    })
  )
  return [...visits, ...longHistory]
}

function buildStressEntries(
  now: moment.Moment,
  firstYearStart: moment.Moment
): TimeEntry[] {
  const entries: TimeEntry[] = []
  const cursor = firstYearStart.clone()
  const today = now.clone().startOf('day')
  let index = 0
  while (cursor.isBefore(today)) {
    const weekOff = Math.floor(index / 7) % 3 === 0 && cursor.day() === 3
    if (cursor.day() !== 0 && !weekOff) {
      entries.push({
        id: `${SCENARIO_ID_PREFIX}stress-entry-${index}`,
        date: cursor.clone().hour(9).toDate(),
        hours: 1 + (index % 4),
        minutes: (index % 4) * 15,
        note: index % 40 === 0 ? 'Cart at the station' : undefined,
      })
    }
    if (cursor.date() === 15) {
      entries.push({
        id: `${SCENARIO_ID_PREFIX}stress-ldc-${index}`,
        date: cursor.clone().hour(13).toDate(),
        hours: 5,
        minutes: 0,
        credit: true,
        categoryId: LDC_BUILTIN_CATEGORY_ID,
      })
      if (cursor.month() % 3 === 0)
        entries.push({
          id: `${SCENARIO_ID_PREFIX}stress-credit-${index}`,
          date: cursor.clone().hour(15).toDate(),
          hours: 3,
          minutes: 0,
          credit: true,
        })
    }
    index++
    cursor.add(1, 'day')
  }
  return entries
}

function buildStressPlans(now: moment.Moment): {
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
} {
  const today = now.clone().startOf('day')
  const dayPlans = Array.from({ length: 400 }, (_, index) => ({
    id: `${SCENARIO_ID_PREFIX}stress-plan-${index}`,

    date: today
      .clone()
      .add(60 - index * 3, 'days')
      .toDate(),
    minutes: 60 + (index % 4) * 30,
    startTimeInMinutes: 9 * 60 + (index % 3) * 60,
    title: index % 5 === 0 ? 'Cart witnessing' : undefined,
  }))
  const recurringPlans = Array.from({ length: 20 }, (_, index) => {
    const startDate = today
      .clone()
      .subtract(2, 'years')
      .add(index * 11, 'days')
    return {
      id: `${SCENARIO_ID_PREFIX}stress-recurring-${index}`,
      startDate: startDate.toDate(),
      minutes: 120,
      startTimeInMinutes: 8 * 60 + (index % 5) * 60,
      title: `Group ${index + 1}`,
      recurrence: {
        frequency:
          index % 4 === 3
            ? RecurringPlanFrequencies.MONTHLY
            : RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: null,
      },

      deletedDates: Array.from({ length: 20 }, (_, skip) =>
        startDate
          .clone()
          .add(skip * 5, 'weeks')
          .toDate()
      ),
      overrides: Array.from({ length: 10 }, (_, moved) => ({
        date: startDate
          .clone()
          .add(moved * 10 + 2, 'weeks')
          .toDate(),
        minutes: 90,
      })),
    }
  })
  return { dayPlans, recurringPlans }
}

function buildStressRoleHistory(firstYearStart: moment.Moment): RoleHistory {
  const month = (offset: number) =>
    firstYearStart.clone().add(offset, 'months').format('YYYY-MM')
  return {
    initial: 'publisher',
    changes: {
      [month(9)]: 'regularAuxiliary',
      [month(12)]: 'regularPioneer',
    },
  }
}

function buildStress(now: moment.Moment): Scenario {
  const serviceYearStart = serviceYearStartFor(now)
  const firstYearStart = serviceYearStart
    .clone()
    .subtract(STRESS_YEARS - 1, 'years')
  const contacts = buildContacts(now, STRESS_CONTACTS)
  const { dayPlans, recurringPlans } = buildStressPlans(now)
  const submittedReportMonths: string[] = []
  const month = firstYearStart.clone()
  while (month.isBefore(now, 'month')) {
    submittedReportMonths.push(month.format('YYYY-MM'))
    month.add(1, 'month')
  }
  return {
    onboarded: true,
    role: 'regularPioneer',
    roleHistory: buildStressRoleHistory(firstYearStart),
    tenureStartDate: firstYearStart.clone().add(12, 'months').toDate(),
    profileName: 'Verify',
    contacts,
    visits: buildStressVisits(now, contacts),
    timeEntries: buildStressEntries(now, firstYearStart),
    dayPlans,
    recurringPlans,
    submittedReportMonths,
  }
}

function serviceYearStartFor(now: moment.Moment): moment.Moment {
  return serviceYearBounds(getServiceYearFromDate(now)).start
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
    roleHistory: null,
    tenureStartDate: null,
    profileName: 'Verify',
    contacts: [],
    visits: [],
    timeEntries: [],
    dayPlans: [],
    recurringPlans: [],
    submittedReportMonths: [],
  }
  if (name === 'fresh' || name === 'onboarded') return empty
  if (name === 'stress') return buildStress(now)

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
  const pioneer: Scenario = {
    ...empty,
    role: 'regularPioneer',
    tenureStartDate: serviceYearStart.clone().subtract(2, 'years').toDate(),
    contacts,
    visits: buildVisits(now, contacts),
    timeEntries: buildPioneerEntries(now, serviceYearStart),
    dayPlans: buildDayPlans(now),
  }
  if (name !== 'badges') return pioneer

  const history = buildBadgeHistoryFixture({ now })
  return {
    ...pioneer,
    contacts: [...pioneer.contacts, ...history.contacts],
    visits: [...pioneer.visits, ...history.visits],
    timeEntries: [...pioneer.timeEntries, ...history.timeEntries],
    recurringPlans: history.recurringPlans,
    submittedReportMonths: history.submittedReportMonths,
  }
}
