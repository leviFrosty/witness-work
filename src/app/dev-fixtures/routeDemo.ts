import moment from 'moment'
import type { Contact } from '@/types/contact'
import type { DayPlan } from '@/types/timeEntry'
import type { Visit } from '@/types/visit'

export const ROUTE_DEMO_ID_PREFIX = 'dev-route-demo-'

type Call = {
  slug: string
  name: string
  line1: string
  zip: string
  coordinate: { latitude: number; longitude: number }
  time: string
  topic: string
}

const CALLS: Call[] = [
  {
    slug: 'rosa',
    name: 'Rosa Delgado',
    line1: '1243 Church St',
    zip: '94114',
    coordinate: { latitude: 37.7518, longitude: -122.4282 },
    time: '10:00',
    topic: 'Bring the brochure she asked about',
  },
  {
    slug: 'owen',
    name: 'Owen Park',
    line1: '455 Castro St',
    zip: '94114',
    coordinate: { latitude: 37.7616, longitude: -122.435 },
    time: '10:45',
    topic: 'Finish the discussion on Psalm 23',
  },
  {
    slug: 'mei',
    name: 'Mei Chou',
    line1: '3150 Mission St',
    zip: '94110',
    coordinate: { latitude: 37.7464, longitude: -122.4191 },
    time: '11:15',
    topic: 'Lesson 3',
  },
  {
    slug: 'samuel',
    name: 'Samuel Okoro',
    line1: '300 Valencia St',
    zip: '94103',
    coordinate: { latitude: 37.7669, longitude: -122.4219 },
    time: '12:00',
    topic: 'Return the magazine',
  },
  {
    slug: 'haddad',
    name: 'Nadia Haddad',
    line1: '1500 Guerrero St',
    zip: '94110',
    coordinate: { latitude: 37.7486, longitude: -122.4229 },
    time: '13:30',
    topic: 'Show the video on prayer',
  },
]

export const buildRouteDemoFixture = ({
  day,
}: {
  day: moment.Moment | Date
}): { contacts: Contact[]; visits: Visit[]; dayPlans: DayPlan[] } => {
  const start = moment(day).startOf('day')
  const dayKey = start.format('YYYY-MM-DD')
  const contactId = (slug: string) => `${ROUTE_DEMO_ID_PREFIX}contact-${slug}`
  const dayId = (slug: string) => `${ROUTE_DEMO_ID_PREFIX}${dayKey}-${slug}`
  const at = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number)
    return start.clone().hours(hours!).minutes(minutes!)
  }
  const lastVisit = start.clone().subtract(9, 'days').hours(11)

  const contacts: Contact[] = CALLS.map((call) => ({
    id: contactId(call.slug),
    name: call.name,
    createdAt: start.clone().subtract(60, 'days').toDate(),
    address: {
      line1: call.line1,
      city: 'San Francisco',
      state: 'CA',
      zip: call.zip,
    },
    coordinate: call.coordinate,
  }))

  const visits: Visit[] = CALLS.map((call) => ({
    id: dayId(`visit-${call.slug}`),
    contact: { id: contactId(call.slug) },
    date: lastVisit.toDate(),
    note: 'Route demo',
    isBibleStudy: call.slug === 'mei',
    followUp: {
      date: at(call.time).toDate(),
      notifyMe: false,
      topic: call.topic,
    },
  }))

  const dayPlans: DayPlan[] = [
    {
      id: dayId('meeting'),
      date: start.toDate(),
      startTimeInMinutes: 9 * 60,
      minutes: 180,
      title: 'Meeting for field service',
      location: {
        name: 'Noe Valley Hall',
        address: '4050 24th St, San Francisco, CA 94114',
        latitude: 37.7515,
        longitude: -122.4339,
      },
    },
    {
      id: dayId('cart'),
      date: start.toDate(),
      startTimeInMinutes: 12 * 60,
      anytime: true,
      minutes: 30,
      title: 'Cart witnessing',
      location: {
        name: 'Dolores Park',
        address: 'Dolores St & 19th St, San Francisco, CA 94114',
        latitude: 37.7596,
        longitude: -122.4269,
      },
    },
  ]

  return { contacts, visits, dayPlans }
}
