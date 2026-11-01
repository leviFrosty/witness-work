import React, { type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  const i18n = new I18n({ en }, { locale: 'en' })
  return { default: i18n, _i18n: i18n }
})

const device = vi.hoisted(() => ({
  online: true as boolean | null,
  updateRequired: false,
}))
vi.mock('@/lib/http/online', () => ({ useOnline: () => device.online }))
vi.mock('@/lib/appUpdate/updateRequired', () => ({
  useUpdateRequired: (select: (state: { required: unknown }) => unknown) =>
    select({ required: device.updateRequired ? { source: 'server' } : null }),
}))
vi.mock('@/components/ui/InlineNotice', async () => {
  const ReactModule = await import('react')
  return {
    default: (props: { children?: ReactNode }) =>
      ReactModule.createElement('InlineNotice', props),
  }
})

import {
  initialSharedCarsSession,
  useSharedCarsSession,
  type SharedCarSyncStatus,
} from '@/stores/sharedCarsSession'
import {
  MileageSharingContext,
  NO_MILEAGE_SHARING,
} from '@/features/mileage/hooks/useMileageSharing'
import SharedCarsNotice from '@/features/mileage/components/SharedCarsNotice'

type NoticeProps = { message: string; tone: string }

let renderer: ReactTestRenderer | undefined

function render(
  props: { hasSharedCars: boolean; spaceId?: string },
  { enabled = true }: { enabled?: boolean } = {}
) {
  act(() => {
    renderer = create(
      <MileageSharingContext.Provider
        value={{ ...NO_MILEAGE_SHARING, enabled }}
      >
        <SharedCarsNotice {...props} />
      </MileageSharingContext.Provider>
    )
  })
  return renderer!
}

function notice(tree: ReactTestRenderer): NoticeProps | null {
  const found = tree.root.findAll(
    (node) => node.type === ('InlineNotice' as never)
  )
  if (found.length === 0) return null
  const { message, tone } = found[0].props as NoticeProps
  return { message, tone }
}

const cars = (statuses: Record<string, SharedCarSyncStatus>) =>
  useSharedCarsSession.setState({ cars: statuses })

beforeEach(() => {
  device.online = true
  device.updateRequired = false
  useSharedCarsSession.setState(initialSharedCarsSession, true)
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

describe('the Shared Cars notice', () => {
  it('shows nothing while changes are being shared', () => {
    expect(notice(render({ hasSharedCars: true }))).toBeNull()
  })

  it('shows nothing without a Shared Car, whatever else is wrong', () => {
    device.online = false
    device.updateRequired = true
    useSharedCarsSession.setState({ suspended: true, disabled: true })
    cars({ s1: { syncing: false, held: 2, tooLarge: 1 } })
    expect(notice(render({ hasSharedCars: false }))).toBeNull()
    expect(
      notice(render({ hasSharedCars: false }, { enabled: false }))
    ).toBeNull()
  })

  it('asks for an update first', () => {
    device.updateRequired = true
    device.online = false
    expect(notice(render({ hasSharedCars: true }))).toEqual({
      message: 'Update WitnessWork to keep sharing changes to shared cars.',
      tone: 'info',
    })
  })

  it('says the account’s changes aren’t being shared while suspended', () => {
    useSharedCarsSession.setState({ suspended: true })
    expect(notice(render({ hasSharedCars: true }))?.message).toBe(
      "Your changes to shared cars aren't being shared right now. If you think this is a mistake, contact support from the Help Center."
    )
  })

  it('says shared cars aren’t available while the server’s switch is off', () => {
    useSharedCarsSession.setState({ disabled: true })
    expect(notice(render({ hasSharedCars: true }))).toEqual({
      message:
        "Shared cars aren't available right now. Your changes will be shared once they're back.",
      tone: 'info',
    })
  })

  it('says the same while Shared Cars is off on this device', () => {
    expect(notice(render({ hasSharedCars: true }, { enabled: false }))).toEqual(
      {
        message:
          "Shared cars aren't available right now. Your changes will be shared once they're back.",
        tone: 'info',
      }
    )
  })

  it('says changes wait for the connection while offline', () => {
    device.online = false
    expect(notice(render({ hasSharedCars: true }))).toEqual({
      message:
        "You're offline. Changes to shared cars will be shared when you're back online.",
      tone: 'offline',
    })
    act(() => renderer?.unmount())

    device.online = true
    cars({ s1: { syncing: false, lastError: 'network' } })
    expect(notice(render({ hasSharedCars: true }))?.tone).toBe('offline')
  })

  it('says changes are held back while this device’s clock is far ahead', () => {
    cars({ s1: { syncing: false, held: 3 } })
    expect(notice(render({ hasSharedCars: true }))).toEqual({
      message:
        "Some changes to shared cars aren't being shared yet because this device's clock is ahead. Check its date and time.",
      tone: 'info',
    })
  })

  it('says a change is too large to share', () => {
    cars({ s1: { syncing: false, tooLarge: 1 } })
    expect(notice(render({ hasSharedCars: true }))).toEqual({
      message:
        'Some changes to shared cars are too large to share. Shorten long trip notes so they can be shared.',
      tone: 'info',
    })
  })

  it('on a car’s form, speaks for that car alone', () => {
    cars({
      s1: { syncing: false, held: 2 },
      s2: { syncing: false, tooLarge: 1 },
      s3: { syncing: false, lastError: 'network' },
      s4: { syncing: false },
    })
    expect(
      notice(render({ hasSharedCars: true, spaceId: 's1' }))?.message
    ).toBe(
      "Some changes to shared cars aren't being shared yet because this device's clock is ahead. Check its date and time."
    )
    act(() => renderer?.unmount())
    expect(
      notice(render({ hasSharedCars: true, spaceId: 's2' }))?.message
    ).toBe(
      'Some changes to shared cars are too large to share. Shorten long trip notes so they can be shared.'
    )
    act(() => renderer?.unmount())
    expect(notice(render({ hasSharedCars: true, spaceId: 's3' }))?.tone).toBe(
      'offline'
    )
    act(() => renderer?.unmount())
    expect(notice(render({ hasSharedCars: true, spaceId: 's4' }))).toBeNull()
    act(() => renderer?.unmount())

    expect(
      notice(render({ hasSharedCars: true, spaceId: 'unsynced' }))
    ).toBeNull()
    act(() => renderer?.unmount())

    expect(notice(render({ hasSharedCars: true }))?.tone).toBe('offline')
  })

  it('goes once the session clears', () => {
    cars({ s1: { syncing: false, tooLarge: 1 } })
    const tree = render({ hasSharedCars: true })
    expect(notice(tree)).not.toBeNull()
    act(() => cars({ s1: { syncing: false } }))
    expect(notice(tree)).toBeNull()
  })
})
