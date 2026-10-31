import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  const i18n = new I18n({ en }, { locale: 'en' })
  return { default: i18n, _i18n: i18n }
})
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import { SpaceError } from '@/lib/sharedSpaces/client'
import { CarInvitationError } from '@/app/sharedCars/carInvitations'
import {
  type CarPeopleActionsDeps,
  type CarPeopleEvent,
  createCarPeopleActions,
} from '@/app/sharedCars/carPeopleActions'
import { SharedCarsError } from '@/app/sharedCars/engine'
import { sharedCarErrorMessage } from '@/app/sharedCars/sharedCarErrors'
import {
  carInvite,
  carMember,
  sharedCar,
} from '@/lib/mileage/testing/sharedCars'
import type { SharedCar } from '@/types/sharedCars'

const NOW = 1_000_000
const SPACE = 'space'

/** The actions over fakes, with what they toasted and reported. */
function setup(car: SharedCar = sharedCar(SPACE)) {
  const events: CarPeopleEvent[] = []
  const toasts: { intent: string; title: string; options?: object }[] = []
  const toastAs =
    (intent: string) =>
    (title: string, options?: object): string => {
      toasts.push({ intent, title, options })
      return String(toasts.length)
    }
  const engine = {
    shareCar: vi.fn(async () => ({ spaceId: SPACE })),
    leaveCar: vi.fn(async () => ({ pending: false })),
    stopSharing: vi.fn(async () => {}),
    removeMember: vi.fn(async () => {}),
  }
  const invitations = {
    inviteBuddy: vi.fn(async () => {}),
    cancelInvite: vi.fn(async () => {}),
  }
  const actions = createCarPeopleActions({
    engine,
    invitations,
    store: { getState: () => ({ cars: { [SPACE]: car } }) },
    toast: {
      info: toastAs('info'),
      success: toastAs('success'),
      error: toastAs('error'),
    },
    now: () => NOW,
    onEvent: (event: CarPeopleEvent) => events.push(event),
    failureName: (error: unknown) =>
      error instanceof SpaceError ? error.code : 'unknown',
  } as unknown as CarPeopleActionsDeps)
  return { actions, engine, invitations, events, toasts }
}

describe('sharing a car', () => {
  it('shares it and gives its space', async () => {
    const { actions, engine, events, toasts } = setup()
    expect(await actions.shareCar({ id: 'car-1', name: 'Mazda' })).toBe(SPACE)
    expect(engine.shareCar).toHaveBeenCalledWith('car-1')
    expect(events).toEqual([{ name: 'shared_car_share_started' }])
    expect(toasts).toEqual([])
  })

  it('says why it couldn’t, and reports the failure without details', async () => {
    const { actions, engine, events, toasts } = setup()
    engine.shareCar.mockRejectedValueOnce(new SpaceError('suspended', 403))
    expect(await actions.shareCar({ id: 'car-1', name: 'Mazda' })).toBeNull()
    expect(events).toEqual([
      { name: 'shared_car_share_started' },
      { name: 'shared_car_share_failed', reason: 'suspended' },
    ])
    expect(toasts).toEqual([
      {
        intent: 'error',
        title: "Couldn't share Mazda",
        options: {
          message:
            'Shared cars have been turned off for you. If you think this is a mistake, contact support from the Help Center.',
        },
      },
    ])
  })
})

describe('inviting a buddy', () => {
  const ana = { inboxId: 'inbox-ana', name: 'Ana' }

  it('says it’s inviting, then that it did, in one toast', async () => {
    const { actions, invitations, toasts } = setup()
    expect(await actions.invite(SPACE, ana)).toBe(true)
    expect(invitations.inviteBuddy).toHaveBeenCalledWith(SPACE, 'inbox-ana')
    const key = `shared-car-invite:${SPACE}:inbox-ana`
    expect(toasts).toEqual([
      { intent: 'info', title: 'Inviting Ana…', options: { key } },
      {
        intent: 'success',
        title: 'Invited Ana',
        options: { key, message: 'They can join from their notifications.' },
      },
    ])
  })

  it('doesn’t invite to a full car', async () => {
    const members = Array.from({ length: 9 }, (_, n) =>
      carMember(SPACE, `m${n}`, `Person ${n}`)
    )
    const full = sharedCar(SPACE, {
      members,
      invites: [carInvite(SPACE, 'open', 'Open', { expiresAt: NOW + 1 })],
    })
    const { actions, invitations, toasts } = setup(full)
    expect(await actions.invite(SPACE, ana)).toBe(false)
    expect(invitations.inviteBuddy).not.toHaveBeenCalled()
    expect(toasts).toMatchObject([
      {
        intent: 'error',
        title: "Couldn't invite Ana",
        options: { message: 'This car already has the most people it can.' },
      },
    ])
  })

  it('counts an expired invitation’s place as free', async () => {
    const members = Array.from({ length: 9 }, (_, n) =>
      carMember(SPACE, `m${n}`, `Person ${n}`)
    )
    const car = sharedCar(SPACE, {
      members,
      invites: [carInvite(SPACE, 'old', 'Old', { expiresAt: NOW })],
    })
    const { actions } = setup(car)
    expect(await actions.invite(SPACE, ana)).toBe(true)
  })

  it('says why the invitation failed, naming the buddy', async () => {
    const { actions, invitations, toasts } = setup()
    invitations.inviteBuddy.mockRejectedValueOnce(
      new CarInvitationError('already_on_car')
    )
    expect(await actions.invite(SPACE, ana)).toBe(false)
    expect(toasts.at(-1)).toMatchObject({
      intent: 'error',
      title: "Couldn't invite Ana",
      options: { message: 'Ana is already on this car.' },
    })
  })
})

describe('changing who’s on a car', () => {
  it('leaves, saying a copy was kept', async () => {
    const { actions, engine, toasts } = setup()
    expect(await actions.leave(SPACE, 'Mazda')).toBe(true)
    expect(engine.leaveCar).toHaveBeenCalledWith(SPACE)
    expect(toasts).toEqual([
      {
        intent: 'success',
        title: 'You left Mazda',
        options: { message: 'A copy of its trips is in your cars.' },
      },
    ])
  })

  it('removes someone, and reports that it did', async () => {
    const { actions, engine, events, toasts } = setup()
    expect(await actions.remove(SPACE, { memberId: 'ben', name: 'Ben' })).toBe(
      true
    )
    expect(engine.removeMember).toHaveBeenCalledWith(SPACE, 'ben')
    expect(events).toEqual([{ name: 'shared_car_member_removed' }])
    expect(toasts).toMatchObject([{ intent: 'success', title: 'Removed Ben' }])
  })

  it('says why stopping sharing failed', async () => {
    const { actions, engine, toasts } = setup()
    engine.stopSharing.mockRejectedValueOnce(new SharedCarsError('not_owner'))
    expect(await actions.stopSharing(SPACE, '')).toBe(false)
    expect(toasts).toEqual([
      {
        intent: 'error',
        title: "Couldn't stop sharing a shared car",
        options: {
          message: 'Only the person who shared this car can do that.',
        },
      },
    ])
  })

  it('cancels an invitation', async () => {
    const { actions, invitations, toasts } = setup()
    expect(await actions.cancelInvite(SPACE, 'i1')).toBe(true)
    expect(invitations.cancelInvite).toHaveBeenCalledWith(SPACE, 'i1')
    expect(toasts).toMatchObject([{ intent: 'success' }])
  })
})

describe('Shared Cars errors', () => {
  it('read as the User would put them', () => {
    expect(sharedCarErrorMessage(new SpaceError('network'))).toBe(
      sharedCarErrorMessage(new SpaceError('timeout'))
    )
    expect(sharedCarErrorMessage(new SpaceError('limit'))).toBe(
      'This car already has the most people it can.'
    )
    expect(
      sharedCarErrorMessage(new CarInvitationError('not_buddy'), {
        name: 'Ana',
      })
    ).toContain('Ana')
    expect(sharedCarErrorMessage(new Error('boom'))).toBe(
      sharedCarErrorMessage(undefined)
    )
  })
})
