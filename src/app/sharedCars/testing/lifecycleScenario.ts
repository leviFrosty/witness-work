import { expect } from 'vitest'
import { memberTag } from '@/lib/sharedSpaces/crypto'
import type { HeadlessMember } from '@/app/sharedCars/testing/headlessMember'
import type { Trip } from '@/types/mileage'

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function ownCar(member: HeadlessMember) {
  member.savePersonal('vehicles', {
    id: crypto.randomUUID(),
    name: 'Interop car',
    createdAt: Date.now(),
  })
  const [car] = member.personal().vehicles
  member.savePersonal('fuels', {
    id: crypto.randomUUID(),
    name: 'Gasoline',
    createdAt: Date.now(),
  })
  const [fuel] = member.personal().fuels
  member.savePersonal('vehicleSetups', {
    id: crypto.randomUUID(),
    vehicleId: car.id,
    effectiveFrom: '2026-01-01',
    fuelId: fuel.id,
    milesPerGallon: 30,
  })
  for (let n = 1; n <= 3; n++)
    member.savePersonal('trips', {
      id: crypto.randomUUID(),
      vehicleId: car.id,
      date: '2026-02-03',
      distanceMiles: n,
      createdAt: Date.now(),
    })
  return car.id
}

async function invite(
  owner: HeadlessMember,
  spaceId: string,
  who: HeadlessMember
) {
  const payload = await owner.engine.createInvite(spaceId, {
    name: who.name,
    tag: memberTag(spaceId, who.inboxId),
  })
  await who.engine.joinCar(payload)
  return payload
}

const memberIdOf = (member: HeadlessMember, spaceId: string) =>
  member.car(spaceId).myMemberId

const firstTrip = (member: HeadlessMember, spaceId: string): Trip =>
  [...member.car(spaceId).trips].sort((a, b) => a.id.localeCompare(b.id))[0]

export async function runSharedCarLifecycle({
  person,
  device,
  spaceGone,
}: {
  person: (name: string) => HeadlessMember

  device: (of: HeadlessMember) => HeadlessMember

  spaceGone: (spaceId: string, lastMember: HeadlessMember) => Promise<boolean>
}) {
  const anna = person('Anna')
  const joe = person('Joe')
  const cal = person('Cal')

  const vehicleId = ownCar(anna)
  const { spaceId } = await anna.engine.shareCar(vehicleId)
  expect(anna.car(spaceId).trips).toHaveLength(3)
  expect(anna.personal().vehicles).toEqual([])

  await invite(anna, spaceId, joe)
  await invite(anna, spaceId, cal)
  expect(joe.car(spaceId).trips).toHaveLength(3)
  await anna.engine.syncCar(spaceId)
  expect(anna.car(spaceId).members.map((m) => m.name)).toEqual([
    'Anna',
    'Joe',
    'Cal',
  ])
  expect(anna.car(spaceId).invites).toEqual([])

  joe.store.getState().saveTrip(spaceId, {
    id: crypto.randomUUID(),
    vehicleId: joe.car(spaceId).vehicles[0].id,
    date: '2026-02-04',
    distanceMiles: 9,
    createdAt: Date.now(),
  })
  await joe.engine.syncCar(spaceId)
  await anna.engine.syncCar(spaceId)
  await cal.engine.syncCar(spaceId)
  expect(anna.car(spaceId).trips).toHaveLength(4)
  expect(cal.car(spaceId).trips).toHaveLength(4)

  joe.store
    .getState()
    .saveTrip(spaceId, { ...firstTrip(joe, spaceId), note: 'Joe' })
  await pause(20)
  cal.store
    .getState()
    .saveTrip(spaceId, { ...firstTrip(cal, spaceId), note: 'Cal' })
  await joe.engine.syncCar(spaceId)
  await cal.engine.syncCar(spaceId)
  for (const member of [anna, joe, cal]) {
    await member.engine.syncCar(spaceId)
    expect(firstTrip(member, spaceId).note).toBe('Cal')
  }

  await anna.engine.removeMember(spaceId, memberIdOf(cal, spaceId))
  expect(anna.car(spaceId).epoch).toBe(2)
  expect(await cal.engine.syncCar(spaceId)).toBe('ended')
  expect(cal.personal().trips).toHaveLength(4)
  await joe.engine.syncCar(spaceId)
  expect(joe.car(spaceId).epoch).toBe(2)

  const again = await invite(anna, spaceId, cal)
  expect(again.epoch).toBe(2)
  expect(cal.car(spaceId).trips).toHaveLength(4)
  expect(cal.keyring.epochs(spaceId)).toEqual([2, 1])
  expect(cal.car(spaceId).sealedRecords).toEqual([])

  expect(await anna.engine.leaveCar(spaceId)).toEqual({ pending: false })
  expect(anna.personal().trips).toHaveLength(4)
  await joe.engine.syncCar(spaceId)
  expect(joe.car(spaceId).ownerId).toBe(memberIdOf(joe, spaceId))
  expect(joe.car(spaceId).epoch).toBe(3)
  await cal.engine.syncCar(spaceId)
  expect(cal.car(spaceId).epoch).toBe(3)

  const calsTablet = device(cal)
  await calsTablet.engine.addCarFromRoster(spaceId, Date.now())
  expect(calsTablet.keyring.epochs(spaceId)).toEqual([3, 2, 1])
  expect(calsTablet.car(spaceId).trips).toHaveLength(4)
  expect(calsTablet.car(spaceId).sealedRecords).toEqual([])

  await cal.engine.leaveCar(spaceId)
  expect(await joe.engine.syncCar(spaceId)).toBe('ended')
  expect(joe.personal().vehicles).toHaveLength(1)
  expect(joe.outcomes).toContainEqual({
    type: 'ended',
    reason: 'last_member',
  })

  expect(await spaceGone(spaceId, joe)).toBe(true)
}
