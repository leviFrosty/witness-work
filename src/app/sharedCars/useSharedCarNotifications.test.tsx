import { createElement, type ReactElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
const NOW = vi.hoisted(() => 1_000_000_000)
vi.mock('@/hooks/useNow', () => ({
  default: () => ({ now: NOW, refresh: () => {} }),
}))
const flags = vi.hoisted(() => ({ sharedCars: true, buddies: true }))
vi.mock('@/lib/featureFlags', () => ({
  useFeatureFlag: (flag: string) => flag === 'shared-cars' && flags.sharedCars,
}))
vi.mock('@/features/buddies/hooks/useBuddiesEnabled', () => ({
  default: () => flags.buddies,
}))
const navigation = vi.hoisted(() => ({ navigate: vi.fn() }))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => navigation,
}))
const buddiesEngine = vi.hoisted(() => ({
  markNotificationRead: vi.fn(),
  dismissNotification: vi.fn(),
}))
vi.mock('@/features/buddies/lib/buddiesService', () => ({ buddiesEngine }))

vi.mock('@/features/buddies/lib/buddyProfile', () => ({
  buddyDisplayName: (buddy: { name: string; nickname?: string }) =>
    buddy.nickname ?? buddy.name,
}))
vi.mock('@/app/sharedCars/SharedCarNotificationRow', () => ({
  default: 'SharedCarNotificationRow',
}))

import useSharedCars from '@/stores/sharedCars'
import { sharedCar } from '@/lib/mileage/testing/sharedCars'
import type { NotificationItem } from '@/types/notifications'
import type {
  Buddy,
  BuddyNotification,
  IncomingCarInvite,
} from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import type { CarInviteAnswer } from '@/app/sharedCars/SharedCarNotificationRow'
import useSharedCarNotifications, {
  carInviteAnswer,
} from '@/app/sharedCars/useSharedCarNotifications'

const DAY = 24 * 60 * 60 * 1000

const invite = (
  spaceId: string,
  fields: Partial<IncomingCarInvite> = {}
): IncomingCarInvite => ({
  from: 'anna',
  spaceId,
  inviteId: `invite-${spaceId}`,
  rev: 1,
  name: 'Mazda CX-5',
  people: 2,
  expiresAt: NOW + DAY,
  receivedAt: NOW - DAY,
  status: 'pending',
  ...fields,
})

const inviteEntry = (key: string): BuddyNotification => ({
  id: `entry-${key}`,
  kind: 'carInvite',
  at: NOW - DAY,
  read: false,
  from: 'anna',
  name: 'Anna',
  shareKey: key,
})

describe('how an invitation shows in the bell', () => {
  const at = { onCar: false, now: NOW }

  it('is open while it can be answered', () => {
    expect(carInviteAnswer(invite('s'), at)).toBe('open')
  })

  it('isn’t listed once it lapsed unanswered, was canceled, or went', () => {
    expect(carInviteAnswer(invite('s', { expiresAt: NOW }), at)).toBeNull()
    expect(carInviteAnswer(invite('s', { expiresAt: NOW - 1 }), at)).toBeNull()
    expect(carInviteAnswer(invite('s', { status: 'cancelled' }), at)).toBeNull()
    expect(carInviteAnswer(undefined, at)).toBeNull()
  })

  it('shows the answer given', () => {
    expect(carInviteAnswer(invite('s', { status: 'joined' }), at)).toBe(
      'joined'
    )
    expect(carInviteAnswer(invite('s', { status: 'declined' }), at)).toBe(
      'declined'
    )

    expect(
      carInviteAnswer(invite('s', { status: 'joined', expiresAt: NOW - 1 }), at)
    ).toBe('joined')
  })

  it('reads as joined for a car the User is on', () => {
    const onCar = { onCar: true, now: NOW }
    expect(carInviteAnswer(invite('s'), onCar)).toBe('joined')
    expect(carInviteAnswer(invite('s', { status: 'declined' }), onCar)).toBe(
      'joined'
    )

    expect(
      carInviteAnswer(invite('s', { status: 'cancelled' }), onCar)
    ).toBeNull()
  })
})

type RowProps = {
  entry: BuddyNotification
  answer?: CarInviteAnswer
  people?: number
  car?: string
  unread: boolean
  onPress?: () => void
  onDismiss?: () => void
  onJoined: () => void
}

let items: NotificationItem[] = []
let renderer: ReactTestRenderer | undefined

function Probe() {
  return createElement('probe', { items: useSharedCarNotifications() })
}

function render() {
  act(() => {
    renderer = create(<Probe />)
  })
  items = renderer!.root.find((node) => node.type === ('probe' as never)).props
    .items as NotificationItem[]
  return items
}

const dismiss = vi.fn()
const closeThen = vi.fn((action: () => void) => action())

const rowOf = (item: NotificationItem) =>
  (item.render!({ unread: true, dismiss, closeThen }) as ReactElement<RowProps>)
    .props

const itemFor = (key: string) =>
  items.find((item) => item.id === `entry-${key}`)

beforeEach(() => {
  flags.sharedCars = true
  flags.buddies = true
  navigation.navigate.mockClear()
  buddiesEngine.markNotificationRead.mockClear()
  buddiesEngine.dismissNotification.mockClear()
  dismiss.mockClear()
  closeThen.mockClear()
  useBuddies.setState({
    registeredInboxId: 'me',
    buddies: [
      {
        inboxId: 'anna',
        name: 'Anna',
        nickname: 'Annie',
        status: 'active',
      } as Buddy,
    ],
    notifications: [],
    carInvites: {},
  })
  useSharedCars.setState({ cars: {}, memberships: { cars: {}, leftCars: {} } })
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  items = []
})

function seedInvites(invites: Record<string, IncomingCarInvite>) {
  useBuddies.setState({
    carInvites: invites,
    notifications: Object.keys(invites).map(inviteEntry),
  })
}

describe('Shared Cars in the bell', () => {
  it('holds an invitation to answer, with no dismiss', () => {
    seedInvites({ open: invite('s-open') })
    render()
    const item = itemFor('open')!
    expect(item).toMatchObject({
      kind: 'buddies',
      title: 'Annie',
      sticky: true,
    })
    const row = rowOf(item)
    expect(row).toMatchObject({
      answer: 'open',
      people: 2,
      car: 'Mazda CX-5',
    })
    expect(row.onDismiss).toBeUndefined()

    expect(row.onPress).toBeUndefined()
  })

  it('lets an answered one go', () => {
    seedInvites({
      joined: invite('s-joined', { status: 'joined' }),
      declined: invite('s-declined', { status: 'declined' }),
    })
    render()
    for (const [key, answer] of [
      ['joined', 'joined'],
      ['declined', 'declined'],
    ] as const) {
      const item = itemFor(key)!
      expect(item.sticky).toBe(false)
      const row = rowOf(item)
      expect(row.answer).toBe(answer)
      expect(row.onDismiss).toBe(dismiss)
    }
  })

  it('reads an invitation to a car the User is on as joined', () => {
    seedInvites({
      here: invite('s-here'),
      roster: invite('s-roster'),
    })
    useSharedCars.setState({
      cars: {
        's-here': sharedCar('s-here', {
          vehicles: [{ id: 'vehicle-here', name: 'Family Van', createdAt: 1 }],
        }),
      },

      memberships: { cars: { 's-roster': { at: NOW - 1 } }, leftCars: {} },
    })
    render()

    const here = itemFor('here')!
    expect(here.sticky).toBe(false)
    const hereRow = rowOf(here)
    expect(hereRow).toMatchObject({ answer: 'joined', car: 'Family Van' })
    expect(hereRow.onDismiss).toBe(dismiss)

    hereRow.onPress!()
    expect(navigation.navigate).toHaveBeenCalledWith('Mileage')

    const roster = itemFor('roster')!
    expect(roster.sticky).toBe(false)
    const rosterRow = rowOf(roster)
    expect(rosterRow.answer).toBe('joined')
    expect(rosterRow.onDismiss).toBe(dismiss)
    expect(rosterRow.onPress).toBeUndefined()
  })

  it('reads a car left since as open again', () => {
    seedInvites({ left: invite('s-left') })
    useSharedCars.setState({
      memberships: {
        cars: { 's-left': { at: NOW - 10 } },
        leftCars: { 's-left': NOW - 5 },
      },
    })
    render()
    expect(rowOf(itemFor('left')!).answer).toBe('open')
  })

  it('leaves out an invitation that lapsed unanswered, or was canceled', () => {
    seedInvites({
      lapsed: invite('s-lapsed', { expiresAt: NOW - 1 }),
      canceled: invite('s-canceled', { status: 'cancelled' }),
      open: invite('s-open'),
    })
    useBuddies.setState((state) => ({
      notifications: [...state.notifications, inviteEntry('missing')],
    }))
    render()
    expect(items.map((item) => item.id)).toEqual(['entry-open'])
  })

  it('lists nothing while Shared Cars or Buddies isn’t running here', () => {
    seedInvites({ open: invite('s-open') })
    flags.sharedCars = false
    expect(render()).toEqual([])
    act(() => renderer?.unmount())

    flags.sharedCars = true
    flags.buddies = false
    expect(render()).toEqual([])
    act(() => renderer?.unmount())

    flags.buddies = true
    useBuddies.setState({ registeredInboxId: null })
    expect(render()).toEqual([])
  })

  it('opens the People of a car a buddy joined', () => {
    useBuddies.setState({
      notifications: [
        {
          id: 'joined-1',
          kind: 'carJoined',
          at: NOW,
          read: false,
          from: 'anna',
          name: 'Anna',
          spaceId: 's-mine',
        },
      ],
    })
    useSharedCars.setState({
      cars: {
        's-mine': sharedCar('s-mine', {
          vehicles: [{ id: 'vehicle-mine', name: 'Civic', createdAt: 1 }],
        }),
      },
    })
    render()
    const [item] = items
    expect(item.sticky).toBe(false)
    const row = rowOf(item)
    expect(row.answer).toBeUndefined()
    expect(row.car).toBe('Civic')
    expect(row.onDismiss).toBe(dismiss)
    row.onPress!()
    expect(closeThen).toHaveBeenCalledTimes(1)
    expect(navigation.navigate).toHaveBeenCalledExactlyOnceWith(
      'MileageVehicleForm',
      { vehicleId: 'vehicle-mine' }
    )
  })

  it('shows Mileage once a join works', () => {
    seedInvites({ open: invite('s-open') })
    render()
    rowOf(itemFor('open')!).onJoined()
    expect(closeThen).toHaveBeenCalledTimes(1)
    expect(navigation.navigate).toHaveBeenCalledExactlyOnceWith('Mileage')
  })

  it('marks read and dismisses through Buddies, by entry', () => {
    seedInvites({ joined: invite('s-joined', { status: 'joined' }) })
    render()
    const item = itemFor('joined')!
    item.onView!()
    item.onDismiss!()
    expect(buddiesEngine.markNotificationRead).toHaveBeenCalledExactlyOnceWith(
      'entry-joined'
    )
    expect(buddiesEngine.dismissNotification).toHaveBeenCalledExactlyOnceWith(
      'entry-joined'
    )
  })
})
