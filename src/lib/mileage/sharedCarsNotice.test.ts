import { describe, expect, it } from 'vitest'
import { sharedCarsNotice } from '@/lib/mileage/sharedCarsNotice'
import type { SharedCarSyncStatus } from '@/stores/sharedCarsSession'

const calm = {
  hasSharedCars: true,
  online: true,
  session: { suspended: false, disabled: false, cars: {} },
  updateRequired: false,
}
const failing = (lastError: SharedCarSyncStatus['lastError']) => ({
  ...calm,
  session: {
    ...calm.session,
    cars: { a: { syncing: false }, b: { syncing: false, lastError } },
  },
})

describe('the Shared Cars notice', () => {
  it('says nothing while changes are being shared, or with no Shared Car', () => {
    expect(sharedCarsNotice(calm)).toBeNull()

    expect(sharedCarsNotice({ ...calm, online: null })).toBeNull()
    expect(
      sharedCarsNotice({
        ...calm,
        hasSharedCars: false,
        online: false,
        updateRequired: true,
      })
    ).toBeNull()
  })

  it('says why changes can’t be shared now', () => {
    expect(sharedCarsNotice({ ...calm, online: false })).toBe('offline')
    expect(sharedCarsNotice(failing('network'))).toBe('offline')
    expect(sharedCarsNotice(failing('timeout'))).toBe('offline')
    expect(
      sharedCarsNotice({
        ...calm,
        session: { ...calm.session, suspended: true },
      })
    ).toBe('suspended')
    expect(sharedCarsNotice(failing('suspended'))).toBe('suspended')
    expect(
      sharedCarsNotice({
        ...calm,
        session: { ...calm.session, disabled: true },
      })
    ).toBe('disabled')
    expect(sharedCarsNotice(failing('disabled'))).toBe('disabled')
    expect(sharedCarsNotice({ ...calm, updateRequired: true })).toBe(
      'updateRequired'
    )
    expect(sharedCarsNotice(failing('upgrade_required'))).toBe('updateRequired')
  })

  it('leaves other failures to each action’s own message', () => {
    expect(sharedCarsNotice(failing('rate_limited'))).toBeNull()
    expect(sharedCarsNotice(failing('stale_key'))).toBeNull()
  })

  it('puts what the User can act on first', () => {
    expect(
      sharedCarsNotice({
        hasSharedCars: true,
        online: false,
        session: { suspended: true, disabled: true, cars: {} },
        updateRequired: true,
      })
    ).toBe('updateRequired')
    expect(
      sharedCarsNotice({
        ...calm,
        online: false,
        session: { suspended: true, disabled: true, cars: {} },
      })
    ).toBe('suspended')
    expect(
      sharedCarsNotice({
        ...calm,
        online: false,
        session: { suspended: false, disabled: true, cars: {} },
      })
    ).toBe('disabled')
  })

  it('says when Shared Cars is off on this device, with a car still here', () => {
    expect(sharedCarsNotice({ ...calm, sharing: false })).toBe('disabled')

    expect(sharedCarsNotice({ ...calm, sharing: false, online: false })).toBe(
      'disabled'
    )
    expect(
      sharedCarsNotice({ ...calm, sharing: false, hasSharedCars: false })
    ).toBeNull()
  })

  it('says when changes are held back, or too large to share', () => {
    const status = (extra: Partial<SharedCarSyncStatus>) => ({
      ...calm,
      session: {
        ...calm.session,
        cars: { a: { syncing: false }, b: { syncing: false, ...extra } },
      },
    })
    expect(sharedCarsNotice(status({ held: 2 }))).toBe('held')
    expect(sharedCarsNotice(status({ tooLarge: 1 }))).toBe('tooLarge')
    expect(sharedCarsNotice(status({ held: 0, tooLarge: 0 }))).toBeNull()

    expect(
      sharedCarsNotice({ ...status({ held: 2, tooLarge: 1 }), online: false })
    ).toBe('offline')
    expect(sharedCarsNotice(status({ held: 2, tooLarge: 1 }))).toBe('held')
  })

  it('says when a car isn’t ready on this device yet', () => {
    const waiting = {
      ...calm,
      session: {
        ...calm.session,
        cars: {
          a: { syncing: false, held: 1 },
          b: { syncing: false, waitingForKey: true },
        },
      },
    }
    expect(sharedCarsNotice(waiting)).toBe('waiting')
    expect(sharedCarsNotice({ ...waiting, spaceId: 'a' })).toBe('held')
    expect(sharedCarsNotice({ ...waiting, online: false })).toBe('offline')
  })

  it('speaks for one car on its form', () => {
    const session = {
      suspended: false,
      disabled: false,
      cars: {
        a: { syncing: false, tooLarge: 1 },
        b: { syncing: false, lastError: 'network' as const },
        c: { syncing: false },
      },
    }
    const forCar = (spaceId: string) =>
      sharedCarsNotice({ ...calm, session, spaceId })
    expect(forCar('a')).toBe('tooLarge')
    expect(forCar('b')).toBe('offline')
    expect(forCar('c')).toBeNull()

    expect(forCar('d')).toBeNull()

    expect(
      sharedCarsNotice({
        ...calm,
        session: { ...session, suspended: true },
        spaceId: 'c',
      })
    ).toBe('suspended')
    expect(sharedCarsNotice({ ...calm, session })).toBe('offline')
  })
})
