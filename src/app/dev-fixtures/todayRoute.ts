import moment from 'moment'
import type { Contact } from '@/types/contact'
import {
  RecurringPlanFrequencies,
  type DayPlan,
  type RecurringPlan,
} from '@/types/timeEntry'
import type { Visit } from '@/types/visit'

/**
 * Dev-only fixture: today's stops for "Plan today's route" around San
 * Francisco, near the simulator's default location. Covers every case the route
 * screen handles:
 *
 * - 11 located stops (one past the 10-stop limit, so the last starts removed):
 *   Follow-ups with addresses, one with a hand-placed pin, untitled and titled
 *   Day Plans, and a Recurring Plan.
 * - 2 stops without a map location (a Contact with no pin and a Plan with only a
 *   place name), which the screen counts as missing.
 * - Follow-ups that must not show: a dismissed Contact's, and one already
 *   answered by a Visit today.
 * - A Plan with no place at all, which isn't counted as missing.
 *
 * Pure on purpose: no store access and no `Date.now()`, so it's unit-testable.
 * Contacts keep stable ids; Visits and Plans carry today's date in their ids,
 * so running it again the same day changes nothing and running it on a later
 * day adds that day's stops.
 */

export const TODAY_ROUTE_FIXTURE_ID_PREFIX = 'dev-route-'

type Place = {
  slug: string
  name: string
  address: { line1: string; city: string; state: string; zip: string }
  coordinate?: { latitude: number; longitude: number }
  userDraggedCoordinate?: boolean
  /** Local time of today's Follow-up. */
  time: string
  topic: string
}

// Key order is display order: `addressToString` joins fields as stored.
const sf = (line1: string, zip: string) => ({
  line1,
  city: 'San Francisco',
  state: 'CA',
  zip,
})

const FOLLOW_UPS: Place[] = [
  {
    slug: 'ferry',
    name: 'Ruth Calloway',
    address: sf('1 Ferry Building', '94111'),
    coordinate: { latitude: 37.7955, longitude: -122.3937 },
    time: '08:30',
    topic: 'Bring the Bible study brochure',
  },
  {
    slug: 'telegraph',
    name: 'Marcus Feld',
    address: sf('1 Telegraph Hill Blvd', '94133'),
    coordinate: { latitude: 37.8024, longitude: -122.4058 },
    time: '09:15',
    topic: 'Continue the discussion on Psalm 37',
  },
  {
    slug: 'lyon',
    name: 'Imelda Sorensen',
    address: sf('3601 Lyon St', '94123'),
    coordinate: { latitude: 37.8029, longitude: -122.4484 },
    time: '10:00',
    topic: 'Return the magazine she asked for',
  },
  {
    slug: 'steiner',
    name: 'Dev Patel-Ortiz',
    address: sf('710 Steiner St', '94117'),
    coordinate: { latitude: 37.7764, longitude: -122.4346 },
    time: '11:30',
    topic: 'Answer his question about the resurrection',
  },
  {
    slug: 'dolores',
    name: 'Agnes Whitlow',
    address: sf('3700 19th St', '94114'),
    coordinate: { latitude: 37.7596, longitude: -122.4269 },
    time: '13:00',
    topic: 'Lesson 4',
  },
  {
    slug: 'mays',
    name: 'Tobias Renn',
    address: sf('24 Willie Mays Plaza', '94107'),
    coordinate: { latitude: 37.7786, longitude: -122.3893 },
    time: '14:15',
    topic: 'Show the video on prayer',
  },
  {
    slug: 'hagiwara',
    name: 'Lena Okafor',
    address: sf('50 Hagiwara Tea Garden Dr', '94118'),
    coordinate: { latitude: 37.7715, longitude: -122.4687 },
    time: '15:00',
    topic: 'Lesson 2',
  },
  {
    // The pin was dragged off the address, so navigation gets coordinates.
    slug: 'pinned',
    name: 'Hal Brennan (hand-placed pin)',
    address: sf('680 Point Lobos Ave', '94121'),
    coordinate: { latitude: 37.7802, longitude: -122.5115 },
    userDraggedCoordinate: true,
    time: '16:30',
    topic: 'Meet at the trailhead',
  },
  {
    // No pin: counted as a stop missing its location.
    slug: 'no-pin',
    name: 'Nora Vance (no map pin)',
    address: sf('', ''),
    time: '12:00',
    topic: 'Ask for her new address',
  },
]

export type TodayRouteFixtureInput = {
  now: moment.Moment | Date
}

export type TodayRouteFixture = {
  contacts: Contact[]
  visits: Visit[]
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
}

export const buildTodayRouteFixture = ({
  now,
}: TodayRouteFixtureInput): TodayRouteFixture => {
  const today = moment(now).startOf('day')
  const dayKey = today.format('YYYY-MM-DD')
  const contactId = (slug: string) =>
    `${TODAY_ROUTE_FIXTURE_ID_PREFIX}contact-${slug}`
  const dayId = (slug: string) =>
    `${TODAY_ROUTE_FIXTURE_ID_PREFIX}${dayKey}-${slug}`
  const at = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number)
    return today.clone().hours(hours!).minutes(minutes!)
  }
  const minutesOf = (time: string) => at(time).hours() * 60 + at(time).minutes()
  const lastWeek = today.clone().subtract(7, 'days').hours(10)

  const contacts: Contact[] = []
  const visits: Visit[] = []

  const addFollowUp = (place: Place, extra?: Partial<Contact>) => {
    contacts.push({
      id: contactId(place.slug),
      name: place.name,
      createdAt: today.clone().subtract(30, 'days').toDate(),
      address: place.address.line1 ? place.address : undefined,
      coordinate: place.coordinate,
      userDraggedCoordinate: place.userDraggedCoordinate,
      ...extra,
    })
    visits.push({
      id: dayId(`visit-${place.slug}`),
      contact: { id: contactId(place.slug) },
      date: lastWeek.toDate(),
      note: 'Dev route fixture',
      isBibleStudy: false,
      followUp: {
        date: at(place.time).toDate(),
        notifyMe: false,
        topic: place.topic,
      },
    })
  }

  FOLLOW_UPS.forEach((place) => addFollowUp(place))

  // Hidden: the Contact is dismissed until next week.
  addFollowUp(
    {
      slug: 'dismissed',
      name: 'Wes Dalton (dismissed)',
      address: sf('2 Marina Blvd', '94123'),
      coordinate: { latitude: 37.8065, longitude: -122.4321 },
      time: '09:45',
      topic: 'Should not appear on the route',
    },
    { dismissedUntil: today.clone().add(7, 'days').toDate() }
  )

  // Hidden: already visited today, which answers the Follow-up.
  addFollowUp({
    slug: 'answered',
    name: 'Priya Hale (already visited)',
    address: sf('1000 Great Hwy', '94121'),
    coordinate: { latitude: 37.7694, longitude: -122.5107 },
    time: '17:00',
    topic: 'Should not appear on the route',
  })
  visits.push({
    id: dayId('visit-answered-today'),
    contact: { id: contactId('answered') },
    date: today.clone().add(1, 'minute').toDate(),
    note: 'Dev route fixture: answered today',
    isBibleStudy: false,
  })

  const dayPlans: DayPlan[] = [
    {
      id: dayId('plan-cart'),
      date: today.toDate(),
      startTimeInMinutes: minutesOf('11:00'),
      minutes: 60,
      title: 'Cart witnessing',
      location: {
        name: 'Union Square',
        address: '333 Post St, San Francisco, CA 94108',
        latitude: 37.788,
        longitude: -122.4075,
      },
    },
    {
      // Untitled: the place name becomes the stop's title.
      id: dayId('plan-park'),
      date: today.toDate(),
      startTimeInMinutes: minutesOf('17:30'),
      minutes: 60,
      location: {
        name: 'Mission Dolores Park',
        address: 'Dolores St & 19th St, San Francisco, CA 94114',
        latitude: 37.7598,
        longitude: -122.4271,
      },
    },
    {
      // A place name with no pin: counted as missing its location.
      id: dayId('plan-unpinned'),
      date: today.toDate(),
      startTimeInMinutes: minutesOf('12:30'),
      minutes: 30,
      title: 'Meet the group (no map pin)',
      location: { name: 'Brother Ames’s house' },
    },
    {
      // No place at all: not a stop and not counted as missing.
      id: dayId('plan-no-place'),
      date: today.toDate(),
      startTimeInMinutes: minutesOf('19:00'),
      minutes: 60,
      title: 'Letter writing at home',
    },
  ]

  // Weekly, but ends today, so re-running on later days doesn't stack.
  const recurringPlans: RecurringPlan[] = [
    {
      id: dayId('recurring-twin-peaks'),
      startDate: today.toDate(),
      startTimeInMinutes: minutesOf('18:00'),
      minutes: 60,
      title: 'Evening return visits',
      location: {
        name: 'Twin Peaks',
        address: '501 Twin Peaks Blvd, San Francisco, CA 94114',
        latitude: 37.7544,
        longitude: -122.4477,
      },
      recurrence: {
        frequency: RecurringPlanFrequencies.WEEKLY,
        interval: 1,
        endDate: today.clone().endOf('day').toDate(),
      },
    },
  ]

  return { contacts, visits, dayPlans, recurringPlans }
}
