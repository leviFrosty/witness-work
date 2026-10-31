import { lastResult, sharedRecordSpaces } from '@/lib/mileage/view'
import { memberTag } from '@/lib/sharedSpaces/crypto'
import type { ProfileAvatar } from '@/types/avatar'
import type { Trip } from '@/types/mileage'
import type {
  SharedCar,
  SharedCarInvite,
  SharedCarMember,
} from '@/types/sharedCars'

/**
 * Who's who on the User's Shared Cars (docs/mileage-tracking-prd.md, "Shared
 * Cars"): each person on a car as the User knows them, who logged each trip,
 * and whose trips the Mileage screen's person filter keeps. Pure; the mileage
 * feature builds it from `useSharedCars` and the buddies the app hands it.
 */

/** One of the User's buddies, as the app shows them. */
export type MileageBuddy = {
  inboxId: string
  /** The User's nickname for them, else their own name. */
  name: string
  avatar: ProfileAvatar
  /** Their color, behind an initial or emoji. */
  color?: string
}

/** Whose trips the Mileage screen shows: the person filter's "Everyone". */
export const EVERYONE = 'everyone'
/** The person filter's "Me": the User's own cars, and their trips on others. */
export const ME = 'me'

/**
 * Whose trips the Mileage screen shows: everyone's, the User's, or one person's
 * (their `CarPerson.key`).
 */
export type PersonFilter = typeof EVERYONE | typeof ME | (string & {})

/** A person on a Shared Car, or someone who was, whose trips stay. */
export type CarPerson = {
  /**
   * The same for one person on every car: `me`; `buddy:<inboxId>` for one of
   * the User's buddies; else `<spaceId>/<memberId>`, since someone else's buddy
   * has different ids on each car.
   */
  key: string
  spaceId: string
  memberId: string
  /** The User's nickname for a buddy, else the name they share on the car. */
  name: string
  avatar: ProfileAvatar
  color?: string
  /** The User. */
  me: boolean
  /** One of the User's buddies, so the same `key` on every car they're on. */
  buddy: boolean
  /** The person who shared the car, or took it over. */
  owner: boolean
  /** On the car now; false for someone who left, whose trips stay. */
  current: boolean
}

/** Someone invited to a car, as the User knows them. */
export type CarInvitee = Pick<CarPerson, 'name' | 'avatar' | 'color'>

const NO_AVATAR: ProfileAvatar = { type: 'none', value: '' }
/** A JPEG as base64; an emoji is never ASCII, so it never matches. */
const BASE64 = /^[A-Za-z0-9+/]{16,}={0,2}$/

/**
 * A member record's avatar (an emoji, or a 40 px JPEG as base64) as `Avatar`
 * shows it.
 */
export function memberAvatar(avatar: string | undefined): ProfileAvatar {
  if (!avatar) return NO_AVATAR
  return BASE64.test(avatar)
    ? { type: 'image', value: `data:image/jpeg;base64,${avatar}` }
    : { type: 'emoji', value: avatar }
}

/** Tags are hashes; each car and buddy pair is worked out once. */
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
  /** The User is on a Shared Car. */
  shared: boolean
  /** The space `trip` lives in, or undefined for one on the User's own car. */
  spaceOf: (trip: Pick<Trip, 'id'>) => string | undefined
  /** Everyone on the car now, in the order they joined, the User included. */
  onCar: (spaceId: string) => CarPerson[]
  /** A person on the car, including someone who's left. */
  person: (spaceId: string, memberId: string) => CarPerson | undefined
  /** Someone invited to the car: one of the User's buddies, or by name. */
  invitee: (spaceId: string, invite: SharedCarInvite) => CarInvitee
  /** Who logged `trip`; undefined on the User's own cars. */
  loggedBy: (trip: Trip) => CarPerson | undefined
  /** Who last changed `trip`, on a Shared Car, when anyone has. */
  editedBy: (trip: Trip) => CarPerson | undefined
  /**
   * `trip` is the User's: on one of their own cars, or logged by them on a
   * Shared Car.
   */
  mine: (trip: Trip) => boolean
  /** Everyone but the User on any Shared Car now, once each, by name. */
  others: CarPerson[]
  /**
   * The name the User shares on their Shared Cars (their member record's), or
   * empty before it has synced.
   */
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

/**
 * `buddies`, or the list last seen with the same buddies as they show (the
 * app's list is rebuilt whenever Buddies syncs), so what's built from it can be
 * kept.
 */
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

/** One car's people as the User knows them. */
type CarPeople = {
  /** By `memberId`, including people who've left, whose trips stay. */
  known: ReadonlyMap<string, CarPerson>
  /** On the car now, in the order they joined. */
  current: CarPerson[]
  /** The User's buddies, by their tag on this car. */
  buddiesByTag: ReadonlyMap<string, MileageBuddy>
}

/** Each car's people, by its member records, while what they show holds. */
const carPeopleCaches = new WeakMap<
  readonly SharedCarMember[],
  ReturnType<typeof lastResult<CarPeople>>
>()

/**
 * A car's people, the same objects for as long as its people, its owner, and
 * the User's buddies stay as they are: a sync's bookkeeping, or a trip, keeps
 * them, so nothing that shows a person draws again.
 */
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
      // The people on it now first, with the server's `joinedAt`.
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

/** `trip`, on a Shared Car where the User is `myMemberId`, is one they logged. */
const loggedByMe = (trip: Pick<Trip, 'loggedBy'>, myMemberId?: string) =>
  !!myMemberId && trip.loggedBy === myMemberId

const peopleCache = lastResult<MileagePeople>()

/**
 * Who's who on the User's Shared Cars, with `buddies` showing as the User knows
 * them: by nickname, photo, and color. The same object, with the same people,
 * while the cars' people and records and the buddies stay as they are, so a
 * sync's bookkeeping (`seq`, `pendingPuts`, `lastSyncedAt`) changes nothing.
 */
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

/**
 * The trips `filter` keeps: all of them for Everyone; for Me, those on the
 * User's own cars and the ones they logged on Shared Cars; otherwise the ones
 * that person logged. Everyone gives back `trips` itself.
 */
export function tripsByPerson<T extends Trip>(
  trips: T[],
  filter: PersonFilter,
  people: MileagePeople
): T[] {
  if (filter === EVERYONE || !people.shared) return trips
  if (filter === ME) return trips.filter(people.mine)
  return trips.filter((trip) => people.loggedBy(trip)?.key === filter)
}

/**
 * The trips the User logged: those on their own cars, and theirs on Shared
 * Cars. The car they last logged on is the one a new trip uses first, not the
 * one someone else last drove. `trips` itself without Shared Cars.
 */
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

/**
 * `filter` while it still names someone to show, else Everyone: the person it
 * named left every car the User is on, or the User left the last one.
 */
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
