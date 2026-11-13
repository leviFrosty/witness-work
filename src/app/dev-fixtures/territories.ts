import moment from 'moment'
import { returnBy } from '@/features/territories/lib/doors'
import type { PastVisit } from '@/features/territories/lib/visitTally'
import type {
  DoorOutcome,
  StreetNumbering,
  Territory,
  TerritoryDoor,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export const TERRITORY_FIXTURE_ID_PREFIX = 'dev-territory-'

const id = (suffix: string) => `${TERRITORY_FIXTURE_ID_PREFIX}${suffix}`

export type TerritoryFixtureInput = {
  now: moment.Moment | Date
  few?: boolean
  seed?: number
}

export type TerritoryFixture = {
  territories: Territory[]
  pastVisits: Record<string, PastVisit[]>
}

type Session = { day: number; hour: number; minute: number }

const SESSIONS: (Session & { answer: number; weight: number })[] = [
  { day: 6, hour: 9, minute: 30, answer: 0.62, weight: 5 },
  { day: 6, hour: 11, minute: 0, answer: 0.55, weight: 2 },
  { day: 0, hour: 13, minute: 30, answer: 0.5, weight: 3 },
  { day: 3, hour: 10, minute: 0, answer: 0.2, weight: 2 },
  { day: 2, hour: 14, minute: 0, answer: 0.25, weight: 2 },
  { day: 4, hour: 17, minute: 30, answer: 0.48, weight: 2 },
  { day: 5, hour: 9, minute: 30, answer: 0.3, weight: 1 },
]

const STREETS: [string, StreetNumbering][] = [
  ['Maple Avenue', 'even'],
  ['Maple Avenue', 'odd'],
  ['Cedar Lane', 'both'],
  ['Birch Street', 'even'],
  ['Willow Court', 'both'],
  ['Elm Road', 'odd'],
  ['Juniper Way', 'both'],
  ['Aspen Drive', 'even'],
]

const seeded = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Attempt = { at: number; outcome: DoorOutcome }
type DraftDoor = { label: string; attempts: Attempt[] }
type DraftStreet = {
  key: string
  name: string
  numbering: StreetNumbering
  doors: DraftDoor[]
  next: number
}

type Plan = {
  key: string
  number: string
  name: string
  from: number
  until: number
  returned?: boolean
  streets: number
  sessions: number
}

const step = (numbering: StreetNumbering) =>
  numbering === 'odd' || numbering === 'even' ? 2 : 1

const firstNumber = (numbering: StreetNumbering) =>
  numbering === 'even' ? 2 : 1

export function buildTerritoryFixture({
  now,
  few = false,
  seed = 7,
}: TerritoryFixtureInput): TerritoryFixture {
  const random = seeded(seed)
  const today = moment(now).startOf('day')
  const plans: Plan[] = few
    ? [
        {
          key: 'few',
          number: '21',
          name: 'Lakeside',
          from: 10,
          until: 0,
          streets: 2,
          sessions: 1,
        },
      ]
    : [
        {
          key: 'pine-ridge',
          number: '9',
          name: 'Pine Ridge',
          from: 400,
          until: 340,
          returned: true,
          streets: 4,
          sessions: 8,
        },
        {
          key: 'old-town',
          number: '3',
          name: 'Old Town',
          from: 130,
          until: 50,
          returned: true,
          streets: 5,
          sessions: 14,
        },
        {
          key: 'north-hill',
          number: '12',
          name: 'North Hill',
          from: 42,
          until: 0,
          streets: 4,
          sessions: 9,
        },
        {
          key: 'riverside',
          number: '7',
          name: 'Riverside',
          from: 14,
          until: 0,
          streets: 3,
          sessions: 4,
        },
      ]

  const totalWeight = SESSIONS.reduce((sum, s) => sum + s.weight, 0)
  const pickSession = () => {
    let roll = random() * totalWeight
    for (const session of SESSIONS) {
      roll -= session.weight
      if (roll <= 0) return session
    }
    return SESSIONS[0]
  }

  const territories: Territory[] = []
  const pastVisits: Record<string, PastVisit[]> = {}

  for (const plan of plans) {
    const streets: DraftStreet[] = STREETS.slice(0, plan.streets).map(
      ([name, numbering], index) => ({
        key: `${plan.key}-street-${index}`,
        name,
        numbering,
        doors: [],
        next: firstNumber(numbering),
      })
    )
    const span = plan.from - plan.until
    for (let index = 0; index < plan.sessions; index++) {
      const session = pickSession()
      const daysAgo = Math.max(
        plan.until + 1,
        Math.round(plan.from - ((index + 0.5) / plan.sessions) * span)
      )
      const start = today
        .clone()
        .subtract(daysAgo, 'days')
        .day(session.day)
        .hour(session.hour)
        .minute(session.minute)
      if (start.isAfter(moment(now))) start.subtract(7, 'days')
      let at = start.valueOf()
      const knock = (door: DraftDoor) => {
        const hourShift = (new Date(at).getHours() - session.hour) * 0.05
        const roll = random()
        const outcome: DoorOutcome =
          roll < 0.03
            ? 'doNotCall'
            : roll < session.answer - hourShift
              ? 'spoke'
              : 'notHome'
        door.attempts.push({ at, outcome })
        at += (2 + Math.floor(random() * 4)) * 60 * 1000
      }

      const retries = streets
        .flatMap((street) => street.doors)
        .filter((door) => door.attempts.at(-1)?.outcome === 'notHome')
        .slice(0, 6)
      retries.forEach(knock)

      const fresh = 14 + Math.floor(random() * 10)
      for (let n = 0; n < fresh; n++) {
        const street = streets.find((s) => s.next <= 40) ?? streets[0]
        const door: DraftDoor = { label: String(street.next), attempts: [] }
        street.doors.push(door)
        street.next += step(street.numbering)
        knock(door)
      }
    }

    const checkedOutAt = today
      .clone()
      .subtract(plan.from + 1, 'days')
      .hour(19)
      .valueOf()
    const finishedAt = plan.returned
      ? today.clone().subtract(plan.until, 'days').hour(20).valueOf()
      : undefined

    if (plan.returned)
      pastVisits[id(plan.key)] = streets.flatMap((street) =>
        street.doors.flatMap((door) => door.attempts)
      )

    territories.push({
      id: id(plan.key),
      number: plan.number,
      name: plan.name,
      checkedOutAt,
      returnBy: returnBy(checkedOutAt).getTime(),
      finishedAt,
      createdAt: checkedOutAt,
      doNotCalls: [],
      streets: streets.map(
        (street): TerritoryStreet => ({
          id: id(street.key),
          name: street.name,
          numbering: street.numbering,
          next: street.next,
          first: firstNumber(street.numbering),
          doors: plan.returned
            ? []
            : street.doors.map((door, index): TerritoryDoor => {
                const last = door.attempts[door.attempts.length - 1]
                const days = new Set(
                  door.attempts.map((a) => new Date(a.at).toDateString())
                )
                return {
                  id: id(`${street.key}-door-${index}`),
                  label: door.label,
                  outcome: last.outcome,
                  at: last.at,
                  tries: days.size,
                  ...(door.attempts.length > 1 && {
                    history: door.attempts.slice(0, -1),
                  }),
                }
              }),
          workedAt: plan.returned ? finishedAt : undefined,
        })
      ),
    })
  }

  return { territories, pastVisits }
}
