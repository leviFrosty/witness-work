import { describe, expect, it } from 'vitest'
import {
  carPeopleList,
  type CarPeopleRow,
} from '@/app/sharedCars/carPeopleRows'
import { buildMileagePeople } from '@/lib/mileage/people'
import { MAX_SHARED_CAR_PEOPLE } from '@/lib/mileage/sharedCar'
import {
  carInvite,
  carMember,
  sharedCar,
} from '@/lib/mileage/testing/sharedCars'
import { peopleFixture } from '@/lib/mileage/testing/peopleFixture'

const NOW = 1_000_000

const summary = (rows: CarPeopleRow[]) =>
  rows.map((row) =>
    row.kind === 'person'
      ? { name: row.person.name, actions: row.actions }
      : row.kind === 'unnamed'
        ? { unnamed: row.memberId, me: row.me, actions: row.actions }
        : { invited: row.invitee.name, canCancel: row.canCancel }
  )

describe('the car form’s People', () => {
  it('let the owner leave, stop sharing, and remove anyone else', () => {
    const { cars, buddies, VAN } = peopleFixture()
    const people = buildMileagePeople(cars, buddies)
    const { rows, full } = carPeopleList(cars[VAN], people, NOW)

    expect(summary(rows)).toEqual([
      { name: 'Levi', actions: ['leave', 'stopSharing'] },
      { name: 'Annie', actions: ['remove'] },
      { name: 'Ben', actions: ['remove'] },
    ])
    expect(full).toBe(false)
  })

  it('let anyone else only leave', () => {
    const { cars, buddies, MAZDA } = peopleFixture()
    const people = buildMileagePeople(cars, buddies)
    const { rows } = carPeopleList(cars[MAZDA], people, NOW)

    expect(summary(rows)).toEqual([
      { name: 'Annie', actions: [] },
      { name: 'Levi', actions: ['leave'] },
    ])
    expect(rows[0].kind === 'person' && rows[0].person.owner).toBe(true)
  })

  it('list open invitations after the people, cancelable by their sender or the owner', () => {
    const { cars, buddies, MAZDA } = peopleFixture()
    const car = {
      ...cars[MAZDA],
      invites: [
        carInvite(MAZDA, 'mine', 'Ana’s friend', {
          invitedBy: `me-${MAZDA}`,
          expiresAt: NOW + 1,
        }),
        carInvite(MAZDA, 'anas', 'Dee', {
          invitedBy: 'ana-mazda',
          expiresAt: NOW + 1,
        }),
        carInvite(MAZDA, 'expired', 'Eve', {
          invitedBy: `me-${MAZDA}`,
          expiresAt: NOW,
        }),
      ],
    }
    const people = buildMileagePeople({ ...cars, [MAZDA]: car }, buddies)
    const { rows } = carPeopleList(car, people, NOW)

    expect(summary(rows).slice(2)).toEqual([
      { invited: 'Ana’s friend', canCancel: true },
      { invited: 'Dee', canCancel: false },
    ])

    // The owner can cancel every one.
    const owned = { ...car, ownerId: car.myMemberId }
    expect(
      carPeopleList(owned, people, NOW)
        .rows.filter((row) => row.kind === 'invite')
        .map((row) => row.kind === 'invite' && row.canCancel)
    ).toEqual([true, true])
  })

  it('are full at ten people, counting open invitations', () => {
    const spaceId = 'full-space'
    const members = Array.from({ length: 8 }, (_, n) =>
      carMember(spaceId, n === 0 ? `me-${spaceId}` : `m${n}`, `Person ${n}`)
    )
    const invites = [
      carInvite(spaceId, 'open', 'Open', { expiresAt: NOW + 1 }),
      carInvite(spaceId, 'gone', 'Gone', { expiresAt: NOW - 1 }),
    ]
    const car = sharedCar(spaceId, {
      members,
      memberRecords: members,
      invites,
    })
    const people = (c: typeof car) => buildMileagePeople({ [spaceId]: c }, [])

    expect(MAX_SHARED_CAR_PEOPLE).toBe(10)
    // Eight people and one open invitation: one place left.
    expect(carPeopleList(car, people(car), NOW).full).toBe(false)
    const tenth = {
      ...car,
      invites: [
        ...invites,
        carInvite(spaceId, 'tenth', 'Tenth', { expiresAt: NOW + 1 }),
      ],
    }
    expect(carPeopleList(tenth, people(tenth), NOW).full).toBe(true)
  })

  it('list someone whose join didn’t finish, whom only the owner removes', () => {
    const { cars, buddies, VAN, MAZDA } = peopleFixture()
    const withUnnamed = (spaceId: string) => ({
      ...cars[spaceId],
      unnamedMembers: [{ memberId: 'zed', joinedAt: 9 }],
    })
    const people = buildMileagePeople(cars, buddies)

    expect(summary(carPeopleList(withUnnamed(VAN), people, NOW).rows)).toEqual([
      { name: 'Levi', actions: ['leave', 'stopSharing'] },
      { name: 'Annie', actions: ['remove'] },
      { name: 'Ben', actions: ['remove'] },
      { unnamed: 'zed', me: false, actions: ['remove'] },
    ])
    expect(
      summary(carPeopleList(withUnnamed(MAZDA), people, NOW).rows).at(-1)
    ).toEqual({ unnamed: 'zed', me: false, actions: [] })
  })

  it('let the User leave while their own record hasn’t synced', () => {
    const { cars, buddies, MAZDA } = peopleFixture()
    const car = {
      ...cars[MAZDA],
      members: cars[MAZDA].members.filter((m) => m.memberId !== `me-${MAZDA}`),
      unnamedMembers: [{ memberId: `me-${MAZDA}`, joinedAt: 2 }],
    }
    const people = buildMileagePeople({ ...cars, [MAZDA]: car }, buddies)
    expect(summary(carPeopleList(car, people, NOW).rows)).toEqual([
      { name: 'Annie', actions: [] },
      { unnamed: `me-${MAZDA}`, me: true, actions: ['leave'] },
    ])
  })

  it('leave only the way off the car while Shared Cars is off here', () => {
    const { cars, buddies, VAN, MAZDA } = peopleFixture()
    const van = {
      ...cars[VAN],
      unnamedMembers: [{ memberId: 'zed', joinedAt: 9 }],
      invites: [carInvite(VAN, 'i1', 'Dee', { expiresAt: NOW + 1 })],
    }
    const people = buildMileagePeople({ ...cars, [VAN]: van }, buddies)
    const off = { sharing: false }

    expect(summary(carPeopleList(van, people, NOW, off).rows)).toEqual([
      { name: 'Levi', actions: ['leave', 'stopSharing'] },
      { name: 'Annie', actions: [] },
      { name: 'Ben', actions: [] },
      { unnamed: 'zed', me: false, actions: [] },
      { invited: 'Dee', canCancel: false },
    ])
    expect(summary(carPeopleList(cars[MAZDA], people, NOW, off).rows)).toEqual([
      { name: 'Annie', actions: [] },
      { name: 'Levi', actions: ['leave'] },
    ])
  })

  it('count someone whose join didn’t finish toward a full car', () => {
    const spaceId = 'full-space'
    const members = Array.from({ length: 9 }, (_, n) =>
      carMember(spaceId, n === 0 ? `me-${spaceId}` : `m${n}`, `Person ${n}`)
    )
    const car = sharedCar(spaceId, {
      members,
      memberRecords: members,
      unnamedMembers: [{ memberId: 'zed', joinedAt: 9 }],
    })
    const people = buildMileagePeople({ [spaceId]: car }, [])
    expect(carPeopleList(car, people, NOW).full).toBe(true)
  })
})
