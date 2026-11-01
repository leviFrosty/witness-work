import { describe, expect, it } from 'vitest'
import { mergeMileageRecords } from '@/lib/mileage/records'
import {
  activeSharedCarIds,
  carReplyApplies,
  emptySharedCar,
  isOnSharedCar,
  MAX_ROSTER_LEFT_CARS,
  mergeSharedCarMemberships,
  openInvitesTo,
  parseCarInvitePayload,
  rosterSharedCarMemberships,
  withDerivedPeople,
} from '@/lib/mileage/sharedCar'
import type { MileageSnapshot, Trip } from '@/types/mileage'

const id22 = (c: string) => c.repeat(22)
const id43 = (c: string) => c.repeat(43)

describe('Shared Car memberships', () => {
  it('merge as a union, keeping the latest time of each', () => {
    expect(
      mergeSharedCarMemberships(
        { cars: { a: { at: 1 }, b: { at: 5 } }, leftCars: { c: 2 } },
        { cars: { a: { at: 3 }, b: { at: 4 } }, leftCars: { c: 1, d: 7 } }
      )
    ).toEqual({
      cars: { a: { at: 3 }, b: { at: 5 } },
      leftCars: { c: 2, d: 7 },
    })
  })

  it('let leaving win over a join at or before it, and a later join win back', () => {
    const memberships = {
      cars: { a: { at: 5 }, b: { at: 5 }, c: { at: 9 } },
      leftCars: { a: 5, c: 6 },
    }
    expect(isOnSharedCar(memberships, 'a')).toBe(false)
    expect(isOnSharedCar(memberships, 'b')).toBe(true)
    expect(isOnSharedCar(memberships, 'c')).toBe(true)
    expect(isOnSharedCar(memberships, 'd')).toBe(false)
    expect(activeSharedCarIds(memberships)).toEqual(['b', 'c'])
  })
})

describe('the roster’s memberships', () => {
  it('carry the cars the User is on and the latest they left', () => {
    const leftCars = Object.fromEntries(
      Array.from({ length: MAX_ROSTER_LEFT_CARS + 5 }, (_, n) => [
        `left${n}`,
        n,
      ])
    )
    const carried = rosterSharedCarMemberships({
      cars: { on: { at: 500 }, gone: { at: 1 } },
      leftCars: { ...leftCars, gone: 1000 },
    })

    expect(carried.cars).toEqual({ on: { at: 500 } })
    expect(Object.keys(carried.leftCars)).toHaveLength(MAX_ROSTER_LEFT_CARS)
    expect(carried.leftCars).toHaveProperty('gone', 1000)
    expect(carried.leftCars).toHaveProperty(`left${MAX_ROSTER_LEFT_CARS + 4}`)
    expect(carried.leftCars).not.toHaveProperty('left4')
  })

  it('fit the room they’re given, the newest cars on first', () => {
    const memberships = {
      cars: { [id22('a')]: { at: 3 }, [id22('b')]: { at: 9 } },
      leftCars: { [id22('c')]: 5, [id22('d')]: 7 },
    }
    const all = rosterSharedCarMemberships(memberships)
    const json = (value: unknown) => JSON.stringify(value).length

    const car = 22 + json({ at: 9 }) + 4
    const left = 22 + json(7) + 4
    expect(json(all) - json({ cars: {}, leftCars: {} })).toBeLessThanOrEqual(
      2 * car + 2 * left
    )
    const room = car + left
    expect(rosterSharedCarMemberships(memberships, room)).toEqual({
      cars: { [id22('b')]: { at: 9 } },
      leftCars: { [id22('d')]: 7 },
    })
    expect(rosterSharedCarMemberships(memberships, 0)).toEqual({
      cars: {},
      leftCars: {},
    })
  })
})

describe('openInvitesTo', () => {
  const car = (spaceId: string, invitedBy: string, tag: string) =>
    emptySharedCar(spaceId, {
      myMemberId: id22('m'),
      invites: [
        {
          inviteId: id22('i'),
          invitedBy,
          name: 'Joe',
          tag,
          expiresAt: 10,
        },
      ],
    })

  it('lists the User’s own open invitations to a person, on every car', () => {
    const cars = {
      [id22('s')]: car(id22('s'), id22('m'), 'joe-on-s'),
      [id22('t')]: car(id22('t'), id22('m'), 'joe-on-t'),

      [id22('u')]: car(id22('u'), id22('o'), 'joe-on-u'),

      [id22('v')]: car(id22('v'), id22('m'), 'dee-on-v'),
    }
    const tagOn = (spaceId: string) => `joe-on-${spaceId[0]}`
    expect(openInvitesTo(cars, tagOn, 5)).toEqual([
      {
        spaceId: id22('s'),
        inviteId: id22('i'),
        tag: 'joe-on-s',
        expiresAt: 10,
      },
      {
        spaceId: id22('t'),
        inviteId: id22('i'),
        tag: 'joe-on-t',
        expiresAt: 10,
      },
    ])

    expect(openInvitesTo(cars, tagOn, 10)).toEqual([])
  })
})

describe('carReplyApplies', () => {
  const spaceId = id22('s')
  const state = (on: boolean) => ({
    memberships: {
      cars: { [spaceId]: { at: 1 } },
      leftCars: on ? {} : { [spaceId]: 2 },
    },
    cars: {
      [spaceId]: emptySharedCar(spaceId, {
        inviteRecords: [
          {
            inviteId: id22('i'),
            invitedBy: id22('m'),
            name: 'Joe',
            tag: id22('t'),
            expiresAt: 10,
          },
        ],
      }),
    },
  })

  it('takes an answer from the person the invitation went to', () => {
    expect(carReplyApplies(state(true), spaceId, id22('i'), id22('t'))).toBe(
      true
    )
    expect(carReplyApplies(state(true), spaceId, id22('i'), id22('u'))).toBe(
      false
    )
  })

  it('takes one whose record is gone (joined, or closed), on a car the User is on', () => {
    expect(carReplyApplies(state(true), spaceId, id22('j'), id22('u'))).toBe(
      true
    )
    expect(carReplyApplies(state(false), spaceId, id22('i'), id22('t'))).toBe(
      false
    )
    expect(carReplyApplies(state(true), id22('x'), id22('i'), id22('t'))).toBe(
      false
    )
  })
})

describe('parseCarInvitePayload', () => {
  const invite = {
    spaceId: id22('a'),
    inviteId: id22('b'),
    joinSecret: id43('c'),
    epoch: 2,
    key: id43('d'),
    name: 'Mazda CX-5',
    people: 3,
    expiresAt: 1000,
  }

  it('keeps an invitation’s fields, and only those', () => {
    expect(parseCarInvitePayload({ ...invite, v: 1, rev: 4 })).toEqual(invite)
  })

  it('cuts a long car name', () => {
    expect(
      parseCarInvitePayload({ ...invite, name: 'x'.repeat(80) })?.name
    ).toHaveLength(60)
  })

  it('refuses one that isn’t an invitation', () => {
    expect(parseCarInvitePayload(null)).toBeNull()
    expect(parseCarInvitePayload({ ...invite, key: 'short' })).toBeNull()
    expect(parseCarInvitePayload({ ...invite, epoch: 0 })).toBeNull()
    expect(parseCarInvitePayload({ ...invite, spaceId: 3 })).toBeNull()
  })
})

describe('withDerivedPeople', () => {
  it('lists people and invitations once their records have synced', () => {
    const car = withDerivedPeople(
      emptySharedCar(id22('s'), {
        spaceMembers: [
          { memberId: id22('b'), dhPub: id43('q'), joinedAt: 2 },
          { memberId: id22('a'), dhPub: id43('p'), joinedAt: 1 },
          { memberId: id22('c'), dhPub: id43('r'), joinedAt: 3 },
        ],
        memberRecords: [
          {
            memberId: id22('a'),
            name: 'Anna',
            tag: id22('t'),
            joinedAt: 0,
          },
          {
            memberId: id22('b'),
            name: 'Joe',
            tag: id22('u'),
            joinedAt: 2,
          },

          {
            memberId: id22('z'),
            name: 'Zed',
            tag: id22('v'),
            joinedAt: 0,
          },
        ],
        spaceInvites: [
          { inviteId: id22('i'), invitedBy: id22('a'), expiresAt: 9 },
          { inviteId: id22('j'), invitedBy: id22('a'), expiresAt: 9 },
        ],
        inviteRecords: [
          {
            inviteId: id22('i'),
            invitedBy: id22('a'),
            name: 'Dee',
            tag: id22('w'),
            expiresAt: 8,
          },
        ],
      })
    )
    expect(car.members.map((m) => [m.name, m.joinedAt])).toEqual([
      ['Anna', 1],
      ['Joe', 2],
    ])

    expect(car.unnamedMembers).toEqual([{ memberId: id22('c'), joinedAt: 3 }])

    expect(car.invites.map((i) => [i.name, i.expiresAt])).toEqual([['Dee', 9]])
  })
})

describe('mergeMileageRecords', () => {
  const trip = (id: string, updatedAt: number): Trip => ({
    id,
    vehicleId: 'car',
    date: '2026-02-03',
    distanceMiles: 1,
    createdAt: 1,
    updatedAt,
  })
  const state = (
    overrides: Partial<MileageSnapshot> = {}
  ): MileageSnapshot => ({
    vehicles: [],
    fuels: [],
    fuelPrices: [],
    vehicleSetups: [],
    trips: [],
    deletedMileageRecords: [],
    ...overrides,
  })

  it('adds records with their stamps, and replaces only older ones', () => {
    const changes = mergeMileageRecords(
      state({ trips: [trip('a', 5), trip('b', 5)] }),
      { trips: [trip('a', 4), trip('b', 6), trip('c', 1)] }
    )
    expect(changes.trips).toEqual([trip('a', 5), trip('b', 6), trip('c', 1)])
  })

  it('makes no change when nothing is newer, so the same copy twice is one', () => {
    const copy = { trips: [trip('a', 5)] }
    const once = { ...state(), ...mergeMileageRecords(state(), copy) }
    expect(mergeMileageRecords(once, copy)).toEqual({})
  })

  it('keeps a tombstone unless the record is strictly newer', () => {
    const deleted = state({
      deletedMileageRecords: [{ id: 'a', deletedAt: 5 }],
    })
    expect(mergeMileageRecords(deleted, { trips: [trip('a', 5)] })).toEqual({})
    const revived = mergeMileageRecords(deleted, { trips: [trip('a', 6)] })
    expect(revived.trips).toEqual([trip('a', 6)])
    expect(revived.deletedMileageRecords).toEqual([])
  })

  it('applies tombstones it brings to records at or before them, keeping the latest', () => {
    const changes = mergeMileageRecords(
      state({
        trips: [trip('a', 5), trip('b', 7)],
        deletedMileageRecords: [{ id: 'c', deletedAt: 9 }],
      }),
      {
        deletedMileageRecords: [
          { id: 'a', deletedAt: 5 },
          { id: 'b', deletedAt: 6 },
          { id: 'c', deletedAt: 3 },
        ],
      }
    )

    expect(changes.trips).toEqual([trip('b', 7)])
    expect(changes.deletedMileageRecords).toEqual([
      { id: 'c', deletedAt: 9 },
      { id: 'a', deletedAt: 5 },
    ])
  })
})
