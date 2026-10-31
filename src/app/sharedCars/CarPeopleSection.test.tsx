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
vi.mock('expo-localization', () => ({
  getLocales: () => [{ regionCode: 'US', languageTag: 'en-US' }],
  getCalendars: () => [{ uses24hourClock: false }],
}))
vi.mock('react-native', async () => {
  const ReactModule = await import('react')
  return {
    View: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('View', null, children),
  }
})
vi.mock('lucide-react-native', () => ({
  Share2: 'Share2',
  UserPlus: 'UserPlus',
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ fonts: {}, colors: {} }),
}))
const NOW = vi.hoisted(() => 1_000_000)
vi.mock('@/hooks/useNow', () => ({ default: () => ({ now: NOW }) }))

/** Leaf components as host elements, so their props can be read. */
const host = vi.hoisted(() => (name: string) => async () => {
  const ReactModule = await import('react')
  return {
    default: (props: { children?: ReactNode }) =>
      ReactModule.createElement(name, props, props.children),
  }
})
vi.mock('@/components/ui/InfoPopover', host('InfoPopover'))
vi.mock('@/components/ui/MyText', host('Text'))
vi.mock('@/components/ui/inputs/Section', host('Section'))
vi.mock('@/components/ui/layout/XView', host('XView'))
vi.mock('@/app/sharedCars/CarPersonRow', host('CarPersonRow'))
vi.mock('@/app/sharedCars/CarPeopleActionRow', host('CarPeopleActionRow'))
vi.mock('@/app/sharedCars/CarBuddyPickerSheet', host('CarBuddyPickerSheet'))

const confirm = vi.hoisted(() =>
  vi.fn((options: { onConfirm: () => void }) => options.onConfirm())
)
vi.mock('@/lib/confirmDestructive', () => ({ default: confirm }))
const actions = vi.hoisted(() => ({
  shareCar: vi.fn(async (): Promise<string | null> => 'new-space'),
  invite: vi.fn(async () => true),
  cancelInvite: vi.fn(async () => true),
  leave: vi.fn(async () => true),
  stopSharing: vi.fn(async () => true),
  remove: vi.fn(async () => true),
}))
vi.mock('@/app/sharedCars/carPeopleActionsService', () => ({
  carPeopleActions: actions,
}))

import useMileage from '@/stores/mileage'
import useSharedCars from '@/stores/sharedCars'
import {
  MileageSharingContext,
  NO_MILEAGE_SHARING,
  type MileageSharing,
} from '@/features/mileage/hooks/useMileageSharing'
import CarPeopleSection from '@/app/sharedCars/CarPeopleSection'
import { carInvite, carMember } from '@/lib/mileage/testing/sharedCars'
import { peopleFixture } from '@/lib/mileage/testing/peopleFixture'
import type { ContextMenuAction } from '@/components/ui/ContextMenu.types'
import type { SharedCar } from '@/types/sharedCars'

type RowProps = {
  name: string
  subtitle?: string
  actions: ContextMenuAction[]
  last: boolean
}

let renderer: ReactTestRenderer | undefined

function render(vehicleId: string, sharing: Partial<MileageSharing> = {}) {
  const fixture = peopleFixture()
  act(() => {
    renderer = create(
      <MileageSharingContext.Provider
        value={{
          ...NO_MILEAGE_SHARING,
          enabled: true,
          buddies: fixture.buddies,
          ...sharing,
        }}
      >
        <CarPeopleSection vehicleId={vehicleId} />
      </MileageSharingContext.Provider>
    )
  })
  return renderer!
}

const rows = (tree: ReactTestRenderer) =>
  tree.root
    .findAll((node) => node.type === ('CarPersonRow' as never))
    .map((node) => node.props as RowProps)
const actionRow = (tree: ReactTestRenderer) =>
  tree.root.find((node) => node.type === ('CarPeopleActionRow' as never))
const picker = (tree: ReactTestRenderer) =>
  tree.root.find((node) => node.type === ('CarBuddyPickerSheet' as never))
const count = (tree: ReactTestRenderer, type: string) =>
  tree.root.findAll((node) => node.type === (type as never)).length
const menus = (tree: ReactTestRenderer) =>
  rows(tree).map(({ name, actions: menu }) => ({
    name,
    actions: menu.map((action) => action.id),
  }))

function seed(cars: Record<string, SharedCar>) {
  useMileage.setState({
    vehicles: [
      { id: 'civic', name: 'Civic', createdAt: 1 },
      { id: 'old', name: 'Old Car', archived: true, createdAt: 1 },
    ],
    trips: [],
  })
  useSharedCars.setState({ cars })
}

beforeEach(() => {
  seed(peopleFixture().cars)
  for (const action of Object.values(actions)) action.mockClear()
  confirm.mockClear()
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

describe('the car form’s People section', () => {
  it('shows nothing for one of the User’s own cars while sharing is off', () => {
    expect(render('civic', { enabled: false }).toJSON()).toBeNull()
  })

  it('still lists a Shared Car’s people while sharing is off, with only the way off it', async () => {
    const { cars, VAN } = peopleFixture()
    seed({
      ...cars,
      [VAN]: {
        ...cars[VAN],
        invites: [carInvite(VAN, 'i1', 'Dee', { expiresAt: NOW + 86_400_000 })],
      },
    })
    const tree = render('van', { enabled: false })

    // The owner can still leave or stop sharing; nobody can be removed, and
    // the invitation stays, uncancelable.
    expect(menus(tree)).toEqual([
      { name: 'You', actions: ['leave', 'stop_sharing'] },
      { name: 'Annie', actions: [] },
      { name: 'Ben', actions: [] },
      { name: 'Dee', actions: [] },
    ])
    expect(rows(tree).at(-1)).toMatchObject({ last: true })
    expect(count(tree, 'CarPeopleActionRow')).toBe(0)
    expect(count(tree, 'CarBuddyPickerSheet')).toBe(0)

    await act(async () => rows(tree)[0].actions[0].onPress?.())
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Leave Family Minivan?' })
    )
    expect(actions.leave).toHaveBeenCalledWith('van-space', 'Family Minivan')
  })

  it('lets someone else on a car only leave it while sharing is off', () => {
    const tree = render('mazda', { enabled: false })
    expect(menus(tree)).toEqual([
      { name: 'Annie', actions: [] },
      { name: 'You', actions: ['leave'] },
    ])
  })

  it('offers to share one of the User’s own cars, but not an archived one', () => {
    expect(actionRow(render('civic')).props).toMatchObject({
      label: 'Share Car…',
      testID: 'car-share',
    })
    act(() => renderer!.unmount())
    expect(render('old').toJSON()).toBeNull()
  })

  it('shares the car, then offers buddies to invite to it', async () => {
    const tree = render('civic')
    await act(async () => actionRow(tree).props.onPress())
    expect(actions.shareCar).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'civic', name: 'Civic' })
    )
    expect(picker(tree).props).toMatchObject({
      open: true,
      spaceId: 'new-space',
      carName: 'Civic',
    })
  })

  it('points to Buddies, sharing nothing, when the User has no buddies', async () => {
    const tree = render('civic', { buddies: [] })
    await act(async () => actionRow(tree).props.onPress())
    expect(actions.shareCar).not.toHaveBeenCalled()
    expect(picker(tree).props).toMatchObject({
      open: true,
      spaceId: undefined,
    })
  })

  it('lists the owner’s car with what they can do to each person', () => {
    const tree = render('van')
    expect(
      rows(tree).map(({ name, subtitle, actions: menu }) => ({
        name,
        subtitle,
        actions: menu.map((action) => action.id),
      }))
    ).toEqual([
      { name: 'You', subtitle: 'Owner', actions: ['leave', 'stop_sharing'] },
      { name: 'Annie', subtitle: undefined, actions: ['remove'] },
      { name: 'Ben', subtitle: undefined, actions: ['remove'] },
    ])
    expect(actionRow(tree).props).toMatchObject({
      label: 'Invite Buddy…',
      disabled: false,
    })
  })

  it('lets someone else on the car only leave it', () => {
    const tree = render('mazda')
    expect(
      rows(tree).map(({ name, subtitle, actions: menu }) => ({
        name,
        subtitle,
        actions: menu.map((action) => action.id),
      }))
    ).toEqual([
      { name: 'Annie', subtitle: 'Owner', actions: [] },
      { name: 'You', subtitle: undefined, actions: ['leave'] },
    ])
  })

  it('confirms removing someone, then removes them', async () => {
    const tree = render('van')
    const ben = rows(tree)[2]
    await act(async () => ben.actions[0].onPress?.())
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Remove Ben from Family Minivan?',
        confirmLabel: 'Remove',
      })
    )
    expect(actions.remove).toHaveBeenCalledWith('van-space', {
      memberId: 'ben',
      name: 'Ben',
    })
  })

  it('confirms leaving, saying the User keeps a copy', async () => {
    const tree = render('mazda')
    await act(async () => rows(tree)[1].actions[0].onPress?.())
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Leave Mazda CX-5?',
        description: "You'll keep a copy of this car's trips.",
      })
    )
    expect(actions.leave).toHaveBeenCalledWith('mazda-space', 'Mazda CX-5')
  })

  it('lists open invitations, and stops inviting at ten people', async () => {
    const { cars, VAN } = peopleFixture()
    const extra = Array.from({ length: 6 }, (_, n) =>
      carMember(VAN, `p${n}`, `Person ${n}`, { joinedAt: 10 + n })
    )
    const van = cars[VAN]
    seed({
      ...cars,
      [VAN]: {
        ...van,
        members: [...van.members, ...extra],
        memberRecords: [...van.memberRecords, ...extra],
        invites: [carInvite(VAN, 'i1', 'Dee', { expiresAt: NOW + 86_400_000 })],
      },
    })
    const tree = render('van')
    const invite = rows(tree).at(-1)!
    expect(invite.name).toBe('Dee')
    expect(invite.subtitle).toMatch(/^Invited · Expires /)
    expect(invite.actions.map((action) => action.id)).toEqual(['cancel_invite'])
    expect(actionRow(tree).props).toMatchObject({
      disabled: true,
      description: 'This car already has the most people it can.',
    })
  })

  it('confirms canceling an invitation, then cancels it', async () => {
    const { cars, VAN } = peopleFixture()
    seed({
      ...cars,
      [VAN]: {
        ...cars[VAN],
        invites: [carInvite(VAN, 'i1', 'Dee', { expiresAt: NOW + 86_400_000 })],
      },
    })
    const tree = render('van')
    const invite = rows(tree).at(-1)!
    expect(invite.actions.map((action) => action.id)).toEqual(['cancel_invite'])

    // Backing out of the confirmation cancels nothing.
    confirm.mockImplementationOnce(() => {})
    await act(async () => invite.actions[0].onPress?.())
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Cancel the invitation to Dee?',
        description: "They won't be able to join Family Minivan with it.",
        confirmLabel: 'Cancel Invitation',
      })
    )
    expect(actions.cancelInvite).not.toHaveBeenCalled()

    await act(async () => invite.actions[0].onPress?.())
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(actions.cancelInvite).toHaveBeenCalledWith('van-space', 'i1')
  })

  it('lists someone whose join never finished, whom the owner can remove', async () => {
    const { cars, VAN, MAZDA } = peopleFixture()
    const zed = { memberId: 'zed', joinedAt: 9 }
    const unnamed = (car: SharedCar) => ({
      ...car,
      spaceMembers: [
        ...car.members.map(({ memberId, joinedAt }) => ({
          memberId,
          dhPub: '',
          joinedAt,
        })),
        { ...zed, dhPub: '' },
      ],
      unnamedMembers: [zed],
    })
    seed({ ...cars, [VAN]: unnamed(cars[VAN]), [MAZDA]: unnamed(cars[MAZDA]) })

    const tree = render('van')
    expect(menus(tree)).toEqual([
      { name: 'You', actions: ['leave', 'stop_sharing'] },
      { name: 'Annie', actions: ['remove'] },
      { name: 'Ben', actions: ['remove'] },
      { name: 'Someone who joined', actions: ['remove'] },
    ])
    await act(async () => rows(tree)[3].actions[0].onPress?.())
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Remove this person from Family Minivan?',
        description:
          "They joined, but their name didn't come through. They'll no longer be on this car.",
        confirmLabel: 'Remove',
      })
    )
    expect(actions.remove).toHaveBeenCalledWith('van-space', {
      memberId: 'zed',
      name: 'this person',
    })

    // Someone else's car: they're listed, but only its owner removes them.
    act(() => renderer!.unmount())
    expect(menus(render('mazda'))).toEqual([
      { name: 'Annie', actions: [] },
      { name: 'You', actions: ['leave'] },
      { name: 'Someone who joined', actions: [] },
    ])
  })

  it('shows the User as themselves while their own record hasn’t synced', () => {
    const { cars, MAZDA } = peopleFixture()
    const mazda = cars[MAZDA]
    const me = mazda.myMemberId
    seed({
      ...cars,
      [MAZDA]: {
        ...mazda,
        members: mazda.members.filter((m) => m.memberId !== me),
        memberRecords: mazda.memberRecords.filter((m) => m.memberId !== me),
        unnamedMembers: [{ memberId: me, joinedAt: 2 }],
      },
    })
    expect(menus(render('mazda'))).toEqual([
      { name: 'Annie', actions: [] },
      { name: 'You', actions: ['leave'] },
    ])
  })
})
