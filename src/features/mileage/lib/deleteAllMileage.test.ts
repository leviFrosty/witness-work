import { describe, expect, it, vi } from 'vitest'
import {
  deleteAllMileage,
  hasSharedCarsToLeave,
} from '@/features/mileage/lib/deleteAllMileage'
import { sharedCar } from '@/lib/mileage/testing/sharedCars'

const nothing = {
  cars: {},
  memberships: { cars: {}, leftCars: {} },
  joining: {},
  seeding: {},
}

describe('Delete All Mileage Data', () => {
  it('deletes the User’s own mileage, then leaves their Shared Cars', async () => {
    const calls: string[] = []
    const left = await deleteAllMileage({
      deleteOwn: () => calls.push('deleteOwn'),
      leaveSharedCars: async () => {
        calls.push('leaveSharedCars')
        return { notLeft: [] }
      },
      hasSharedCars: true,
    })
    // Leaving first would delete the copies leaving makes.
    expect(calls).toEqual(['deleteOwn', 'leaveSharedCars'])
    expect(left).toEqual({ notLeft: [] })
  })

  it('says which cars it couldn’t leave yet', async () => {
    const left = await deleteAllMileage({
      deleteOwn: () => {},
      leaveSharedCars: async () => ({ notLeft: [{ name: 'Mazda CX-5' }] }),
      hasSharedCars: true,
    })
    expect(left.notLeft).toEqual([{ name: 'Mazda CX-5' }])
  })

  it('leaves nothing without Shared Cars', async () => {
    const leaveSharedCars = vi.fn(async () => ({ notLeft: [] }))
    const deleteOwn = vi.fn()
    const left = await deleteAllMileage({
      deleteOwn,
      leaveSharedCars,
      hasSharedCars: false,
    })
    expect(deleteOwn).toHaveBeenCalledOnce()
    expect(leaveSharedCars).not.toHaveBeenCalled()
    expect(left).toEqual({ notLeft: [] })
  })
})

describe('whether there are Shared Cars to leave', () => {
  it('counts cars here, cars the roster brought, joins, and shares seeding', () => {
    expect(hasSharedCarsToLeave(nothing)).toBe(false)
    expect(
      hasSharedCarsToLeave({ ...nothing, cars: { s1: sharedCar('s1') } })
    ).toBe(true)
    expect(
      hasSharedCarsToLeave({
        ...nothing,
        memberships: { cars: { s1: { at: 2 } }, leftCars: {} },
      })
    ).toBe(true)
    // Left since it was joined: nothing to leave.
    expect(
      hasSharedCarsToLeave({
        ...nothing,
        memberships: { cars: { s1: { at: 2 } }, leftCars: { s1: 3 } },
      })
    ).toBe(false)
    expect(
      hasSharedCarsToLeave({
        ...nothing,
        joining: {
          s1: { spaceId: 's1', inviteId: 'i', epoch: 1, startedAt: 1 },
        },
      })
    ).toBe(true)
    expect(
      hasSharedCarsToLeave({
        ...nothing,
        seeding: {
          s1: {
            spaceId: 's1',
            vehicleId: 'civic',
            startedAt: 1,
            created: false,
            fuelCopies: {},
            priceCopies: {},
            landed: {},
            seq: 0,
          },
        },
      })
    ).toBe(true)
  })
})
