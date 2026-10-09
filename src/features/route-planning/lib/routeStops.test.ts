import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/http/online', () => ({
  isKnownOffline: () => false,
  isDeviceOffline: () => false,
}))
vi.mock('../../../../modules/place-search', () => ({
  isAvailable: false,
  autocomplete: vi.fn(async () => []),
  resolve: vi.fn(async () => null),
}))
vi.mock('@/lib/address', () => ({
  addressToString: (address?: Record<string, string>) =>
    Object.values(address ?? {})
      .filter(Boolean)
      .join(' '),
}))

import moment from 'moment'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import type { Contact } from '@/types/contact'
import {
  RecurringPlanFrequencies,
  type DayPlan,
  type RecurringPlan,
} from '@/types/timeEntry'
import type { Visit } from '@/types/visit'
import { dayRouteStops } from '@/features/route-planning/lib/routeStops'

const day = new Date(2026, 9, 5, 9, 0)
const at = (hour: number, minute = 0, offsetDays = 0) =>
  moment(day).add(offsetDays, 'days').hour(hour).minute(minute).toDate()

const contact = (id: string, extra: Partial<Contact> = {}): Contact => ({
  id,
  name: `Name ${id}`,
  createdAt: new Date(2026, 0, 1),
  coordinate: { latitude: 39.1, longitude: -84.5 },
  address: { line1: `${id} Main St`, city: 'Cincinnati' },
  ...extra,
})

const followUp = (
  id: string,
  contactId: string,
  date: Date,
  extra: Partial<NonNullable<Visit['followUp']>> = {}
): Visit => ({
  id,
  contact: { id: contactId },
  date: at(9, 0, -7),
  isBibleStudy: false,
  followUp: { date, notifyMe: true, ...extra },
})

const contacts = [
  contact('pinned', { userDraggedCoordinate: true }),
  contact('addressed'),
  contact('unlocated', { coordinate: undefined }),
  // Dismissal is checked against the real clock, so keep it in the future.
  contact('dismissed', { dismissedUntil: moment().add(1, 'year').toDate() }),
  contact('answered'),
  contact('noAddress', { address: undefined }),
]

const conversations: Visit[] = [
  followUp('v-addressed', 'addressed', at(14)),
  followUp('v-pinned', 'pinned', at(10)),
  followUp('v-unlocated', 'unlocated', at(11)),
  followUp('v-dismissed-contact', 'dismissed', at(12)),
  followUp('v-answered', 'answered', at(9, 30)),
  // The Visit that answers it, earlier today.
  {
    id: 'v-answer',
    contact: { id: 'answered' },
    date: at(8),
    isBibleStudy: false,
  },
  // A second Follow-up for the same Contact today is one stop.
  followUp('v-addressed-later', 'addressed', at(16)),
  followUp('v-tomorrow', 'noAddress', at(10, 0, 1)),
  followUp('v-cancelled', 'noAddress', at(13), { dismissed: true }),
  followUp('v-no-address', 'noAddress', at(15)),
  followUp('v-deleted-contact', 'gone', at(15)),
]

const today = normalizeDateForStorage(day)
const dayPlans: DayPlan[] = [
  {
    id: 'cart',
    date: today,
    minutes: 120,
    startTimeInMinutes: 8 * 60,
    title: 'Cart witnessing',
    location: {
      name: 'Fountain Square',
      address: '520 Vine St, Cincinnati',
      latitude: 39.1015,
      longitude: -84.5125,
    },
  },
  {
    id: 'address-only',
    date: today,
    minutes: 60,
    location: { address: '1 Unlocated Rd' },
  },
  { id: 'no-place', date: today, minutes: 60 },
  {
    id: 'tomorrow',
    date: normalizeDateForStorage(at(9, 0, 1)),
    minutes: 60,
    location: { latitude: 1, longitude: 1 },
  },
]
const recurringPlans: RecurringPlan[] = [
  {
    id: 'weekly',
    startDate: normalizeDateForStorage(at(9, 0, -14)),
    minutes: 90,
    startTimeInMinutes: 13 * 60,
    location: { name: 'Kingdom Hall', latitude: 39.2, longitude: -84.4 },
    recurrence: {
      frequency: RecurringPlanFrequencies.WEEKLY,
      interval: 1,
      endDate: null,
    },
  },
]

describe('dayRouteStops', () => {
  // Dismiss periods are read against the clock, so pin it to the fixtures' day.
  vi.setSystemTime(day)
  afterAll(() => {
    vi.useRealTimers()
  })
  const result = dayRouteStops({
    day,
    conversations,
    contacts,
    dayPlans,
    recurringPlans,
  })

  it("lists today's located Follow-ups and Plans in time order", () => {
    expect(result.stops.map((stop) => stop.key)).toEqual([
      'plan:cart',
      'followUp:v-pinned',
      'plan:weekly',
      'followUp:v-addressed',
      'followUp:v-no-address',
    ])
  })

  it('counts open stops that lack a map location', () => {
    // The unlocated Contact and the address-only Plan; not the place-less Plan.
    expect(result.missingLocationCount).toBe(2)
  })

  it('hands navigation apps the address unless the pin was placed by hand', () => {
    const byKey = Object.fromEntries(result.stops.map((s) => [s.key, s]))
    expect(byKey['followUp:v-addressed']).toMatchObject({
      kind: 'followUp',
      title: 'Name addressed',
      subtitle: 'addressed Main St Cincinnati',
      startTimeInMinutes: 14 * 60,
      destination: 'addressed Main St Cincinnati',
    })
    expect(byKey['followUp:v-pinned']!.destination).toBe('39.1,-84.5')
    expect(byKey['followUp:v-no-address']).toMatchObject({
      subtitle: undefined,
      destination: '39.1,-84.5',
    })
  })

  it('titles Plans by name, then place, keeping the place line', () => {
    const byKey = Object.fromEntries(result.stops.map((s) => [s.key, s]))
    expect(byKey['plan:cart']).toMatchObject({
      kind: 'plan',
      title: 'Cart witnessing',
      subtitle: 'Fountain Square',
      coordinate: { latitude: 39.1015, longitude: -84.5125 },
      destination: '520 Vine St, Cincinnati',
    })
    expect(byKey['plan:weekly']).toMatchObject({
      title: 'Kingdom Hall',
      subtitle: undefined,
      startTimeInMinutes: 13 * 60,
      destination: '39.2,-84.4',
    })
  })
})
