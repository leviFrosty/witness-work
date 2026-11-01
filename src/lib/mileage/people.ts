import { lastResult, sharedRecordSpaces } from '@/lib/mileage/view'
import { memberTag } from '@/lib/sharedSpaces/crypto'
import type { ProfileAvatar } from '@/types/avatar'
import type { Trip } from '@/types/mileage'
import type {
  SharedCar,
  SharedCarInvite,
  SharedCarMember,
} from '@/types/sharedCars'

export type MileageBuddy = {
  inboxId: string

  name: string
  avatar: ProfileAvatar

  color?: string
}

export const EVERYONE = 'everyone'

export const ME = 'me'

export type PersonFilter = typeof EVERYONE | typeof ME | (string & {})

export type CarPerson = {
  key: string
  spaceId: string
  memberId: string

  name: string
  avatar: ProfileAvatar
  color?: string

  me: boolean

  buddy: boolean

  owner: boolean

  current: boolean
}

export type CarInvitee = Pick<CarPerson, 'name' | 'avatar' | 'color'>

const NO_AVATAR: ProfileAvatar = { type: 'none', value: '' }

const BASE64 = /^[A-Za-z0-9+/]{16,}={0,2}$/

export function memberAvatar(avatar: string | undefined): ProfileAvatar {
  if (!avatar) return NO_AVATAR
  return BASE64.test(avatar)
    ? { type: 'image', value: `data:image/jpeg;base64,${avatar}` }
    : { type: 'emoji', value: avatar }
}

const tags = new Map<string, string>()
function tagOf(spaceId: string, inboxId: string): string {
  const key = `${spaceId}|${inboxId}`
  let tag = tags.get(key)
  if (tag === undefined) {
    tag = memberTag(spaceId, inboxId)
    tags.set(key, tag)
  }
  return tag
}

export type MileagePeople = {
  shared: boolean

  spaceOf: (trip: Pick<Trip, 'id'>) => string | undefined

  onCar: (spaceId: string) => CarPerson[]

  person: (spaceId: string, memberId: string) => CarPerson | undefined

  invitee: (spaceId: string, invite: SharedCarInvite) => CarInvitee

  loggedBy: (trip: Trip) => CarPerson | undefined

  editedBy: (trip: Trip) => CarPerson | undefined

  mine: (trip: Trip) => boolean

  others: CarPerson[]

  nameOnCars: string
}

function describe(
  car: SharedCar,
  member: SharedCarMember,
  buddy: MileageBuddy | undefined,
  current: boolean
): CarPerson {
  const me = member.memberId === car.myMemberId
  return {
    key: me
      ? ME
      : buddy
        ? `buddy:${buddy.inboxId}`
        : `${car.spaceId}/${member.memberId}`,
    spaceId: car.spaceId,
    memberId: member.memberId,
    name: !me && buddy ? buddy.name : member.name,
    avatar:
      !me && buddy && buddy.avatar.type !== 'none'
        ? buddy.avatar
        : memberAvatar(member.avatar),
    ...(!me && buddy?.color !== undefined && { color: buddy.color }),
    me,
    buddy: !me && buddy !== undefined,
    owner: member.memberId === car.ownerId,
    current,
  }
}

const buddyListCache = lastResult<readonly MileageBuddy[]>()

const sameBuddies = (buddies: readonly MileageBuddy[]) =>
  buddyListCache(
    buddies.flatMap((buddy) => [
      buddy.inboxId,
      buddy.name,
      buddy.avatar.type,
      buddy.avatar.value,
      buddy.color,
    ]),
    () => buddies
  )

type CarPeople = {
  known: ReadonlyMap<string, CarPerson>

  current: CarPerson[]

  buddiesByTag: ReadonlyMap<string, MileageBuddy>
}

const carPeopleCaches = new WeakMap<
  readonly SharedCarMember[],
  ReturnType<typeof lastResult<CarPeople>>
>()

function carPeople(
  car: SharedCar,
  buddies: readonly MileageBuddy[]
): CarPeople {
  let cache = carPeopleCaches.get(car.memberRecords)
  if (!cache) {
    cache = lastResult<CarPeople>()
    carPeopleCaches.set(car.memberRecords, cache)
  }
  return cache(
    [car.spaceId, car.myMemberId, car.ownerId, car.members, buddies],
    () => {
      const buddiesByTag = new Map(
        buddies.map((buddy) => [tagOf(car.spaceId, buddy.inboxId), buddy])
      )
      const onCar = new Set(car.members.map((member) => member.memberId))
      const known = new Map<string, CarPerson>()

      for (const member of [...car.members, ...car.memberRecords]) {
        if (known.has(member.memberId)) continue
        known.set(
          member.memberId,
          describe(
            car,
            member,
            buddiesByTag.get(member.tag),
            onCar.has(member.memberId)
          )
        )
      }
      return {
        known,
        current: car.members.map((member) => known.get(member.memberId)!),
        buddiesByTag,
      }
    }
  )
}

const loggedByMe = (trip: Pick<Trip, 'loggedBy'>, myMemberId?: string) =>
  !!myMemberId && trip.loggedBy === myMemberId

const peopleCache = lastResult<MileagePeople>()

export function buildMileagePeople(
  cars: Readonly<Record<string, SharedCar>>,
  buddies: readonly MileageBuddy[]
): MileagePeople {
  const known = sameBuddies(buddies)
  const spaces = sharedRecordSpaces(cars)
  const perCar = Object.values(cars).map(
    (car) => [car.spaceId, car.myMemberId, carPeople(car, known)] as const
  )
  return peopleCache([spaces, ...perCar.flat()], () => {
    const people = new Map(perCar.map(([spaceId, , found]) => [spaceId, found]))
    const myIds = new Map(perCar.map(([spaceId, myId]) => [spaceId, myId]))

    const others = new Map<string, CarPerson>()
    let self: CarPerson | undefined
    for (const { current } of people.values())
      for (const person of current) {
        if (person.me) self ??= person
        else if (!others.has(person.key)) others.set(person.key, person)
      }

    const spaceOf = (trip: Pick<Trip, 'id'>) => spaces.get(trip.id)
    const personOn = (spaceId: string | undefined, memberId?: string) =>
      spaceId === undefined || memberId === undefined
        ? undefined
        : people.get(spaceId)?.known.get(memberId)

    return {
      shared: people.size > 0,
      spaceOf,
      onCar: (spaceId) => people.get(spaceId)?.current ?? [],
      person: (spaceId, memberId) => personOn(spaceId, memberId),
      invitee: (spaceId, invite) => {
        const buddy = people.get(spaceId)?.buddiesByTag.get(invite.tag)
        return buddy
          ? {
              name: buddy.name,
              avatar: buddy.avatar,
              ...(buddy.color !== undefined && { color: buddy.color }),
            }
          : { name: invite.name, avatar: NO_AVATAR }
      },
      loggedBy: (trip) => personOn(spaceOf(trip), trip.loggedBy),
      editedBy: (trip) => personOn(spaceOf(trip), trip.editedBy),
      mine: (trip) => {
        const spaceId = spaceOf(trip)
        return spaceId === undefined || loggedByMe(trip, myIds.get(spaceId))
      },
      others: [...others.values()].sort((a, b) => a.name.localeCompare(b.name)),
      nameOnCars: self?.name ?? '',
    }
  })
}

export function tripsByPerson<T extends Trip>(
  trips: T[],
  filter: PersonFilter,
  people: MileagePeople
): T[] {
  if (filter === EVERYONE || !people.shared) return trips
  if (filter === ME) return trips.filter(people.mine)
  return trips.filter((trip) => people.loggedBy(trip)?.key === filter)
}

export const tripsLoggedByMe = <T extends Trip>(
  trips: T[],
  cars: Readonly<Record<string, SharedCar>>
): T[] => {
  const spaces = sharedRecordSpaces(cars)
  if (spaces.size === 0) return trips
  return trips.filter((trip) => {
    const spaceId = spaces.get(trip.id)
    return spaceId === undefined || loggedByMe(trip, cars[spaceId]?.myMemberId)
  })
}

export function currentPersonFilter(
  filter: PersonFilter,
  people: MileagePeople
): PersonFilter {
  if (!people.shared) return EVERYONE
  if (filter === EVERYONE || filter === ME) return filter
  return people.others.some((person) => person.key === filter)
    ? filter
    : EVERYONE
}
