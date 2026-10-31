import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  const i18n = new I18n({ en }, { locale: 'en' })
  return { default: i18n, _i18n: i18n }
})
const toast = vi.hoisted(() => ({ news: vi.fn() }))
vi.mock('@/stores/toasts', () => ({ toast }))

import {
  announceCarEnding,
  announceShareFailed,
} from '@/app/sharedCars/carEndings'

beforeEach(() => toast.news.mockClear())

describe('a Shared Car ending', () => {
  it('tells the User they’re no longer on it, as news, keyed to the car', () => {
    announceCarEnding({ spaceId: 's1', name: 'Mazda CX-5', reason: 'gone' })
    expect(toast.news).toHaveBeenCalledExactlyOnceWith(
      "You're no longer on Mazda CX-5",
      {
        key: 'shared-car-ended:s1',
        message: 'A copy of its trips is in your cars.',
      }
    )
  })

  it('tells them when everyone else left', () => {
    announceCarEnding({ spaceId: 's1', name: '', reason: 'last_member' })
    expect(toast.news).toHaveBeenCalledExactlyOnceWith(
      'Everyone else left a shared car',
      {
        key: 'shared-car-ended:s1',
        message: "It's one of your own cars again.",
      }
    )
  })

  it('says nothing for what the User did themselves', () => {
    for (const reason of ['left', 'stopped', 'left_elsewhere'] as const)
      announceCarEnding({ spaceId: 's1', name: 'Mazda', reason })
    expect(toast.news).not.toHaveBeenCalled()
  })
})

describe('a share that gave up in the background', () => {
  it('tells the User the car is still their own, and why when it can', () => {
    announceShareFailed({ vehicleId: 'car-1', name: 'Mazda', reason: 'limit' })
    announceShareFailed({ vehicleId: 'car-2', name: '', reason: 'too_large' })
    announceShareFailed({ vehicleId: 'car-3', name: 'Civic', reason: 'other' })
    expect(toast.news.mock.calls).toEqual([
      [
        "Couldn't share Mazda",
        {
          key: 'shared-car-share-failed:car-1',
          message:
            "It has more history than a shared car can hold. It's still one of your own cars.",
        },
      ],
      [
        "Couldn't share your car",
        {
          key: 'shared-car-share-failed:car-2',
          message:
            "One of its trips is too large to share. It's still one of your own cars.",
        },
      ],
      [
        "Couldn't share Civic",
        {
          key: 'shared-car-share-failed:car-3',
          message: "It's still one of your own cars.",
        },
      ],
    ])
  })
})
