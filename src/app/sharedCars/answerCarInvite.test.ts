import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))
vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  const i18n = new I18n({ en }, { locale: 'en' })
  return { default: i18n, _i18n: i18n }
})
const toast = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/stores/toasts', () => ({ toast }))
const analytics = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ analytics }))
const carInvitations = vi.hoisted(() => ({
  join: vi.fn(async (_key: string) => ({ spaceId: 'space' })),
  decline: vi.fn(async (_key: string) => {}),
  isAnswering: vi.fn((_key: string) => false),
}))
vi.mock('@/app/sharedCars/carInvitationsService', () => ({ carInvitations }))

import en from '@/locales/en-US.json'
import { SpaceError, type SpaceErrorCode } from '@/lib/sharedSpaces/client'
import { usePreferences } from '@/stores/preferences'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import type { IncomingCarInvite } from '@/features/buddies/lib/state'
import { CarInvitationError } from '@/app/sharedCars/carInvitations'
import { SharedCarsError } from '@/app/sharedCars/engine'
import {
  carJoinErrorMessage,
  declineCarInvite,
  joinCarInvite,
} from '@/app/sharedCars/answerCarInvite'

const KEY = 'anna|invite-1'
const TOAST_KEY = `shared-car-join:${KEY}`

const invitation = (name: string): IncomingCarInvite => ({
  from: 'anna',
  spaceId: 'space',
  inviteId: 'invite-1',
  rev: 1,
  name,
  people: 1,
  expiresAt: Number.MAX_SAFE_INTEGER,
  receivedAt: 1,
  status: 'pending',
})

beforeEach(() => {
  for (const spy of [toast.info, toast.success, toast.error, analytics.capture])
    spy.mockClear()
  carInvitations.join.mockReset()
  carInvitations.join.mockResolvedValue({ spaceId: 'space' })
  carInvitations.decline.mockReset()
  carInvitations.decline.mockResolvedValue(undefined)
  carInvitations.isAnswering.mockReset()
  carInvitations.isAnswering.mockReturnValue(false)
  useBuddies.setState({ carInvites: { [KEY]: invitation('Mazda CX-5') } })
  usePreferences.setState({ mileageTrackingEnabled: false })
})

describe('joining from the bell', () => {
  it('says it’s joining, then that it joined, in one toast', async () => {
    await expect(joinCarInvite(KEY)).resolves.toBe(true)
    expect(carInvitations.join).toHaveBeenCalledExactlyOnceWith(KEY)
    expect(toast.info).toHaveBeenCalledExactlyOnceWith('Joining Mazda CX-5…', {
      key: TOAST_KEY,
    })
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(
      'You joined Mazda CX-5',
      { key: TOAST_KEY }
    )
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('names "a shared car" when the invitation has no name', async () => {
    useBuddies.setState({ carInvites: { [KEY]: invitation('') } })
    await joinCarInvite(KEY)
    expect(toast.info).toHaveBeenCalledWith('Joining a shared car…', {
      key: TOAST_KEY,
    })
    expect(toast.success).toHaveBeenCalledWith('You joined a shared car', {
      key: TOAST_KEY,
    })
  })

  it('says why joining failed, and leaves Mileage as it was', async () => {
    carInvitations.join.mockRejectedValue(new SpaceError('limit', 429))
    await expect(joinCarInvite(KEY)).resolves.toBe(false)
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "Couldn't join Mazda CX-5",
      { key: TOAST_KEY, message: en.buddies_carFull }
    )
    expect(toast.success).not.toHaveBeenCalled()
    expect(usePreferences.getState().mileageTrackingEnabled).toBe(false)
    expect(analytics.capture).not.toHaveBeenCalled()
  })

  it('turns Mileage Tracking on once, counting where it came from', async () => {
    await joinCarInvite(KEY)
    expect(usePreferences.getState().mileageTrackingEnabled).toBe(true)
    expect(analytics.capture).toHaveBeenCalledExactlyOnceWith(
      'mileage_tracking_changed',
      { enabled: true, source: 'shared_car_joined' }
    )

    // Already on: nothing changes, and nothing more is counted.
    await joinCarInvite(KEY)
    expect(usePreferences.getState().mileageTrackingEnabled).toBe(true)
    expect(analytics.capture).toHaveBeenCalledTimes(1)
  })

  it('does nothing for a second tap while the first is on its way', async () => {
    carInvitations.isAnswering.mockReturnValue(true)
    await expect(joinCarInvite(KEY)).resolves.toBe(false)
    expect(carInvitations.join).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })
})

describe('declining from the bell', () => {
  it('declines', async () => {
    await declineCarInvite(KEY)
    expect(carInvitations.decline).toHaveBeenCalledExactlyOnceWith(KEY)
  })

  it('swallows an invitation that’s no longer open to decline', async () => {
    carInvitations.decline.mockRejectedValue(
      new CarInvitationError('already_on_car')
    )
    await expect(declineCarInvite(KEY)).resolves.toBeUndefined()
    expect(toast.error).not.toHaveBeenCalled()
  })
})

describe('why joining failed', () => {
  const closed = en.buddies_carInviteClosed

  it('says the invitation is closed when it is', () => {
    expect(carJoinErrorMessage(new CarInvitationError('not_found'))).toBe(
      closed
    )
    expect(carJoinErrorMessage(new SharedCarsError('invalid_invite'))).toBe(
      closed
    )
    for (const code of [
      'not_found',
      'forbidden',
      'gone',
      'conflict',
      // An invitation for another epoch than the car's.
      'stale_key',
    ] satisfies SpaceErrorCode[])
      expect(carJoinErrorMessage(new SpaceError(code, 400))).toBe(closed)
  })

  it.each([
    ['limit', en.buddies_carFull],
    ['suspended', en.buddies_carSuspended],
    ['network', en.buddies_errorOffline],
    ['timeout', en.buddies_errorOffline],
    ['rate_limited', en.buddies_errorRateLimited],
  ] satisfies [SpaceErrorCode, string][])(
    'explains a server’s %s',
    (code, message) => {
      expect(carJoinErrorMessage(new SpaceError(code, 0))).toBe(message)
    }
  )

  it('says Buddies needs setting up when there’s no account key', () => {
    expect(carJoinErrorMessage(new SharedCarsError('no_account_key'))).toBe(
      en.mileage.sharedCarError_noAccount
    )
  })

  it('falls back to the generic message', () => {
    expect(carJoinErrorMessage(new Error('x'))).toBe(en.buddies_errorGeneric)
  })
})
