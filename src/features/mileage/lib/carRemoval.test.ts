import { describe, expect, it } from 'vitest'
import { carRemoval } from '@/features/mileage/lib/carRemoval'

describe('removing a car', () => {
  it('offers archiving and deleting on the User’s own car', () => {
    expect(carRemoval({ archived: false })).toEqual({
      archive: true,
      delete: true,
    })
    expect(carRemoval({ archived: true })).toEqual({
      archive: false,
      delete: true,
    })
  })

  it('never offers Delete Car on a Shared Car, only archiving', () => {
    expect(carRemoval({ archived: false, spaceId: 'space' })).toEqual({
      archive: true,
      delete: false,
    })
    expect(carRemoval({ archived: true, spaceId: 'space' })).toEqual({
      archive: false,
      delete: false,
    })
  })
})
