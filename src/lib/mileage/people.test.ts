import { describe, expect, it } from 'vitest'
import { buildMileageIndex, summarizeTrips } from '@/lib/mileage/calc'
import {
  buildMileagePeople,
  currentPersonFilter,
  EVERYONE,
  ME,
  memberAvatar,
  tripsByPerson,
  tripsLoggedByMe,
} from '@/lib/mileage/people'
import { carInvite } from '@/lib/mileage/testing/sharedCars'
import { peopleFixture } from '@/lib/mileage/testing/peopleFixture'

const ids = (trips: { id: string }[]) => trips.map((trip) => trip.id)

describe("who's who on Shared Cars", () => {
  it('lists each car’s people in the order they joined, the User as themselves', () => {
    const { cars, buddies, VAN, MAZDA } = peopleFixture()
    const people = buildMileagePeople(cars, buddies)

    expect(people.shared).toBe(true)
    expect(
      people.onCar(VAN).map(({ key, name, me, owner, current }) => ({
        key,
        name,
        me,
        owner,
        current,
      }))
    ).toEqual([
      { key: ME, name: 'Levi', me: true, owner: true, current: true },
      {
        key: 'buddy:inbox-ana',
        name: 'Annie',
        me: false,
        owner: false,
        current: true,
      },
      {
        key: `${VAN}/ben`,
        name: 'Ben',
        me: false,
        owner: false,
        current: true,
      },
    ])
    expect(people.onCar(MAZDA).map((person) => person.owner)).toEqual([
      true,
      false,
    ])
    expect(people.onCar('elsewhere')).toEqual([])
  })

  it('shows a buddy by the User’s nickname, photo and color, on every car', () => {
    const { cars, buddies, VAN, MAZDA } = peopleFixture()
    const people = buildMileagePeople(cars, buddies)
    const onVan = people.person(VAN, 'ana-van')
    const onMazda = people.person(MAZDA, 'ana-mazda')

    expect(onVan).toMatchObject({
      key: 'buddy:inbox-ana',
      name: 'Annie',
      avatar: { type: 'emoji', value: '🌻' },
      color: '#ff8800',
    })
    expect(onMazda?.key).toBe(onVan?.key)
    // Without the buddy, the name they share on the car.
    expect(buildMileagePeople(cars, []).person(VAN, 'ana-van')).toMatchObject({
      key: `${VAN}/ana-van`,
      name: 'Ana Pereira',
      avatar: { type: 'none' },
    })
  })

  it('keeps someone who left, for the trips they logged, off the car', () => {
    const { cars, buddies, VAN, trips } = peopleFixture()
    const people = buildMileagePeople(cars, buddies)

    expect(people.person(VAN, 'cal')).toMatchObject({
      name: 'Cal',
      current: false,
    })
    expect(people.loggedBy(trips.vanCal)?.name).toBe('Cal')
    expect(people.onCar(VAN).map((person) => person.memberId)).not.toContain(
      'cal'
    )
    expect(people.others.map((person) => person.name)).not.toContain('Cal')
  })

  it('lists everyone else once, by name, across cars', () => {
    const { cars, buddies } = peopleFixture()
    const people = buildMileagePeople(cars, buddies)
    expect(people.others.map((person) => person.name)).toEqual(['Annie', 'Ben'])
  })

  it('says who logged and who edited a trip, only on Shared Cars', () => {
    const { cars, buddies, trips } = peopleFixture()
    const people = buildMileagePeople(cars, buddies)

    expect(people.spaceOf(trips.mine)).toBeUndefined()
    expect(people.loggedBy(trips.mine)).toBeUndefined()
    expect(people.loggedBy(trips.vanMine)?.me).toBe(true)
    expect(people.loggedBy(trips.vanAna)?.name).toBe('Annie')
    expect(people.editedBy(trips.vanAna)?.me).toBe(true)
    expect(people.editedBy(trips.vanCal)).toBeUndefined()
  })

  it('names an invitee as the User knows them', () => {
    const { cars, buddies, VAN } = peopleFixture()
    const people = buildMileagePeople(cars, buddies)

    expect(
      people.invitee(
        VAN,
        carInvite(VAN, 'i1', 'Ana Pereira', { inbox: 'inbox-ana' })
      )
    ).toEqual({
      name: 'Annie',
      avatar: { type: 'emoji', value: '🌻' },
      color: '#ff8800',
    })
    expect(people.invitee(VAN, carInvite(VAN, 'i2', 'Dee'))).toEqual({
      name: 'Dee',
      avatar: { type: 'none', value: '' },
    })
  })

  it('is empty without Shared Cars', () => {
    const people = buildMileagePeople({}, [])
    expect(people.shared).toBe(false)
    expect(people.others).toEqual([])
    expect(people.nameOnCars).toBe('')
  })

  it('knows which trips are the User’s, and the name they share on their cars', () => {
    const { cars, buddies, trips } = peopleFixture()
    const people = buildMileagePeople(cars, buddies)

    expect(people.mine(trips.mine)).toBe(true)
    expect(people.mine(trips.vanMine)).toBe(true)
    expect(people.mine(trips.vanAna)).toBe(false)
    expect(people.mine(trips.mazdaAna)).toBe(false)
    // A Shared Car's trip that doesn't say who logged it isn't theirs.
    expect(people.mine({ ...trips.vanMine, loggedBy: undefined })).toBe(false)
    expect(people.nameOnCars).toBe('Levi')
  })

  it('tells a buddy apart from someone known only on one car', () => {
    const { cars, buddies, VAN } = peopleFixture()
    const people = buildMileagePeople(cars, buddies)
    expect(people.person(VAN, 'ana-van')?.buddy).toBe(true)
    expect(people.person(VAN, 'ben')?.buddy).toBe(false)
    expect(people.person(VAN, `me-${VAN}`)?.buddy).toBe(false)
  })
})

describe('who’s who, kept between builds', () => {
  it('stays the same through a sync’s bookkeeping', () => {
    const { cars, buddies, VAN, trips } = peopleFixture()
    const people = buildMileagePeople(cars, buddies)
    const annie = people.loggedBy(trips.vanAna)

    const synced = {
      ...cars,
      [VAN]: {
        ...cars[VAN],
        seq: 99,
        lastSyncedAt: 12_345,
        pendingPuts: ['van-ana'],
      },
    }
    const again = buildMileagePeople(synced, buddies)
    expect(again).toBe(people)
    expect(again.loggedBy(trips.vanAna)).toBe(annie)
  })

  it('stays the same for a buddy list rebuilt with the same buddies', () => {
    const { cars, buddies } = peopleFixture()
    const people = buildMileagePeople(cars, buddies)
    const rebuilt = buddies.map((buddy) => ({
      ...buddy,
      avatar: { ...buddy.avatar },
    }))
    expect(buildMileagePeople(cars, rebuilt)).toBe(people)
  })

  it('keeps each person while a trip comes, and redraws them when they change', () => {
    const { cars, buddies, VAN, MAZDA, trips } = peopleFixture()
    const people = buildMileagePeople(cars, buddies)
    const ben = people.person(VAN, 'ben')
    const annieOnMazda = people.person(MAZDA, 'ana-mazda')

    // A new trip changes who's who's trips, not its people.
    const withTrip = {
      ...cars,
      [VAN]: {
        ...cars[VAN],
        trips: [
          ...cars[VAN].trips,
          { ...trips.vanBen, id: 'van-ben-2', loggedBy: 'ben' },
        ],
      },
    }
    const afterTrip = buildMileagePeople(withTrip, buddies)
    expect(afterTrip).not.toBe(people)
    expect(afterTrip.spaceOf({ id: 'van-ben-2' })).toBe(VAN)
    expect(afterTrip.person(VAN, 'ben')).toBe(ben)
    expect(afterTrip.person(MAZDA, 'ana-mazda')).toBe(annieOnMazda)

    // Ben renamed himself: his car's people are drawn again, the other's kept.
    const renamed = withTrip[VAN].memberRecords.map((member) =>
      member.memberId === 'ben' ? { ...member, name: 'Benjamin' } : member
    )
    const afterRename = buildMileagePeople(
      {
        ...withTrip,
        [VAN]: {
          ...withTrip[VAN],
          members: withTrip[VAN].members.map(
            (member) => renamed.find((m) => m.memberId === member.memberId)!
          ),
          memberRecords: renamed,
        },
      },
      buddies
    )
    expect(afterRename.person(VAN, 'ben')?.name).toBe('Benjamin')
    expect(afterRename.person(MAZDA, 'ana-mazda')).toBe(annieOnMazda)
  })

  it('redraws a buddy the User renamed', () => {
    const { cars, buddies, VAN } = peopleFixture()
    buildMileagePeople(cars, buddies)
    const renamed = buildMileagePeople(cars, [
      { ...buddies[0], name: 'Ana P.' },
    ])
    expect(renamed.person(VAN, 'ana-van')?.name).toBe('Ana P.')
  })
})

describe('member avatars', () => {
  it('read an emoji as an emoji and a JPEG as an image', () => {
    expect(memberAvatar(undefined)).toEqual({ type: 'none', value: '' })
    expect(memberAvatar('🙂')).toEqual({ type: 'emoji', value: '🙂' })
    const jpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD'
    expect(memberAvatar(jpeg)).toEqual({
      type: 'image',
      value: `data:image/jpeg;base64,${jpeg}`,
    })
  })
})

describe('the person filter', () => {
  const index = buildMileageIndex([], [])

  it('keeps every trip for Everyone', () => {
    const { cars, buddies, allTrips } = peopleFixture()
    const people = buildMileagePeople(cars, buddies)
    expect(tripsByPerson(allTrips, EVERYONE, people)).toBe(allTrips)
  })

  it('keeps the User’s own cars and their trips on Shared Cars for Me', () => {
    const { cars, buddies, allTrips, vehicles } = peopleFixture()
    const people = buildMileagePeople(cars, buddies)
    const mine = tripsByPerson(allTrips, ME, people)

    expect(ids(mine)).toEqual(['mine', 'van-mine'])
    const summary = summarizeTrips(mine, index, vehicles)
    expect(summary.distanceMiles).toBe(30)
    expect(summary.tripCount).toBe(2)
    expect(
      summary.byVehicle.map(({ vehicleId, distanceMiles }) => ({
        vehicleId,
        distanceMiles,
      }))
    ).toEqual([
      { vehicleId: 'civic', distanceMiles: 10 },
      { vehicleId: 'van', distanceMiles: 20 },
    ])
  })

  it('keeps one person’s trips on every car they share with the User', () => {
    const { cars, buddies, allTrips, vehicles, VAN } = peopleFixture()
    const people = buildMileagePeople(cars, buddies)

    const ana = tripsByPerson(allTrips, 'buddy:inbox-ana', people)
    expect(ids(ana)).toEqual(['van-ana', 'mazda-ana'])
    expect(summarizeTrips(ana, index, vehicles).distanceMiles).toBe(90)
    expect(ids(tripsByPerson(allTrips, `${VAN}/ben`, people))).toEqual([
      'van-ben',
    ])
  })

  it('keeps every trip while nothing is shared', () => {
    const { allTrips } = peopleFixture()
    const people = buildMileagePeople({}, [])
    expect(tripsByPerson(allTrips, ME, people)).toBe(allTrips)
  })

  it('goes back to Everyone once its person has gone', () => {
    const { cars, buddies, VAN } = peopleFixture()
    const people = buildMileagePeople(cars, buddies)

    expect(currentPersonFilter(ME, people)).toBe(ME)
    expect(currentPersonFilter(`${VAN}/ben`, people)).toBe(`${VAN}/ben`)
    expect(currentPersonFilter(`${VAN}/cal`, people)).toBe(EVERYONE)
    expect(currentPersonFilter(ME, buildMileagePeople({}, []))).toBe(EVERYONE)
  })
})

describe('the trips the User logged', () => {
  it('leave out what others logged on Shared Cars', () => {
    const { cars, allTrips } = peopleFixture()
    expect(ids(tripsLoggedByMe(allTrips, cars))).toEqual(['mine', 'van-mine'])
    expect(tripsLoggedByMe(allTrips, {})).toBe(allTrips)
  })

  it('are the same ones the Me filter keeps', () => {
    const { cars, buddies, allTrips } = peopleFixture()
    expect(tripsLoggedByMe(allTrips, cars)).toEqual(
      tripsByPerson(allTrips, ME, buildMileagePeople(cars, buddies))
    )
  })
})
