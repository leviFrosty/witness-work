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
vi.mock('react-native', () => ({
  View: 'View',
  Pressable: 'Pressable',
  Platform: { OS: 'ios' },
}))
vi.mock('lucide-react-native', () => ({ X: 'X' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    fonts: {},
    colors: { text: '#000', textAlt: '#666', accent: '#00f', border: '#ddd' },
    fontSize: () => 14,
  }),
}))
const NOW = vi.hoisted(() => 1_000_000)
vi.mock('@/hooks/useNow', () => ({ default: () => ({ now: NOW }) }))

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  buddies: [] as unknown[],
  carBuddies: vi.fn((_spaceId: string): unknown[] => []),
}))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mocks.navigate }),
}))
vi.mock('@/features/buddies/stores/buddiesStore', () => ({
  useBuddies: (select: (state: { buddies: unknown[] }) => unknown) =>
    select({ buddies: mocks.buddies }),
}))
vi.mock('@/features/buddies/lib/buddyProfile', () => ({
  buddyDisplayName: (buddy: { name: string; nickname?: string }) =>
    buddy.nickname ?? buddy.name,
}))
vi.mock('@/app/sharedCars/carInvitationsService', () => ({
  carInvitations: { carBuddies: mocks.carBuddies },
}))

const host = vi.hoisted(() => (name: string) => async () => {
  const ReactModule = await import('react')
  return {
    default: (props: { children?: ReactNode }) =>
      ReactModule.createElement(name, props, props.children),
  }
})
vi.mock('@/components/ui/MyText', host('Text'))
vi.mock('@/components/ui/IconButton', host('IconButton'))
vi.mock('@/components/ui/ActionButton', host('ActionButton'))
vi.mock('@/features/buddies/components/BuddyAvatar', host('BuddyAvatar'))
vi.mock('@/components/ui/PointerHover', async () => {
  const ReactModule = await import('react')
  return {
    default: (props: { children?: ReactNode }) =>
      ReactModule.createElement('PointerHover', props, props.children),
    HoverTint: () => null,
  }
})
vi.mock('@/components/ui/Sheet', async () => {
  const ReactModule = await import('react')
  const Sheet = (props: { children?: ReactNode }) =>
    ReactModule.createElement('Sheet', props, props.children)
  Sheet.ScrollView = (props: { children?: ReactNode }) =>
    ReactModule.createElement('SheetScrollView', props, props.children)
  return { default: Sheet }
})

import useSharedCars from '@/stores/sharedCars'
import CarBuddyPickerSheet from '@/app/sharedCars/CarBuddyPickerSheet'
import {
  carInvite,
  carMember,
  sharedCar,
} from '@/lib/mileage/testing/sharedCars'
import type { Buddy } from '@/features/buddies/lib/state'

const SPACE = 'van-space'

const buddy = (inboxId: string, name: string, nickname?: string): Buddy => ({
  inboxId,
  name,
  ...(nickname !== undefined && { nickname }),
  dhPub: '',
  inviteSecret: '',
  status: 'active',
  pairedAt: 1,
  colorIndex: 0,
})

let renderer: ReactTestRenderer | undefined
const onOpenChange = vi.fn()
const onInvite = vi.fn()

function render(spaceId: string | null = SPACE) {
  act(() => {
    renderer = create(
      <CarBuddyPickerSheet
        open
        onOpenChange={onOpenChange}
        spaceId={spaceId ?? undefined}
        carName='Family Minivan'
        onInvite={onInvite}
      />
    )
  })
  return renderer!
}

type ChoiceProps = {
  accessibilityLabel: string
  accessibilityState: { disabled: boolean }
  disabled: boolean
  onPress: () => void
}

const choices = (tree: ReactTestRenderer) =>
  tree.root
    .findAll((node) => node.type === ('Pressable' as never))
    .map((node) => ({
      props: node.props as ChoiceProps,
      texts: node
        .findAll((child) => child.type === ('Text' as never))
        .map((child) => child.props.children as string),
    }))
const texts = (tree: ReactTestRenderer) =>
  tree.root
    .findAll((node) => node.type === ('Text' as never))
    .map((node) => node.props.children as string)
const goToBuddies = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => node.type === ('ActionButton' as never))
const sheet = (tree: ReactTestRenderer) =>
  tree.root.find((node) => node.type === ('Sheet' as never)).props as {
    onClosed: () => void
  }

function seedCar(extraPeople = 0) {
  const members = [
    carMember(SPACE, `me-${SPACE}`, 'Levi'),
    carMember(SPACE, 'ana', 'Ana Pereira', { inbox: 'inbox-ana' }),
    ...Array.from({ length: extraPeople }, (_, n) =>
      carMember(SPACE, `p${n}`, `Person ${n}`)
    ),
  ]
  useSharedCars.setState({
    cars: {
      [SPACE]: sharedCar(SPACE, {
        members,
        memberRecords: members,
        invites: [
          carInvite(SPACE, 'i-ben', 'Ben', {
            inbox: 'inbox-ben',
            expiresAt: NOW + 3 * 86_400_000,
          }),
        ],
      }),
    },
  })
}

beforeEach(() => {
  mocks.buddies = [
    buddy('inbox-ana', 'Ana Pereira', 'Annie'),
    buddy('inbox-ben', 'Ben'),
    buddy('inbox-cal', 'Cal'),
  ]
  mocks.carBuddies.mockImplementation(() => [
    { inboxId: 'inbox-ana', status: 'onCar', memberId: 'ana' },
    {
      inboxId: 'inbox-ben',
      status: 'invited',
      inviteId: 'i-ben',
      expiresAt: NOW + 3 * 86_400_000,
      mine: true,
    },
    { inboxId: 'inbox-cal', status: 'available' },
  ])
  seedCar()
  mocks.carBuddies.mockClear()
  onOpenChange.mockClear()
  onInvite.mockClear()
  mocks.navigate.mockClear()
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

describe('the Invite to <car> sheet', () => {
  it('says where each buddy stands on the car, and offers only the ones who can be invited', () => {
    const tree = render()
    expect(texts(tree)).toContain('Invite to Family Minivan')
    expect(texts(tree)).toContain(
      "They'll get an invitation in their notifications. It stays open for 7 days."
    )
    expect(mocks.carBuddies).toHaveBeenCalledWith(SPACE)

    const [ana, ben, cal] = choices(tree)
    expect(ana.props.accessibilityLabel).toBe('Annie, On this car')
    expect(ana.texts).toEqual(['Annie', 'On this car'])
    expect(ana.props.disabled).toBe(true)

    expect(ben.props.accessibilityLabel).toMatch(/^Ben, Invited · Expires /)
    expect(ben.texts[1]).toMatch(/^Invited · Expires /)
    expect(ben.props.disabled).toBe(true)

    expect(cal.props.accessibilityLabel).toBe('Cal')
    expect(cal.texts).toEqual(['Cal', 'Invite'])
    expect(cal.props.disabled).toBe(false)
    expect(cal.props.accessibilityState).toEqual({ disabled: false })
  })

  it('closes, then invites the buddy picked', () => {
    const tree = render()
    act(() => choices(tree)[2].props.onPress())
    expect(onOpenChange).toHaveBeenCalledWith(false)

    expect(onInvite).not.toHaveBeenCalled()
    act(() => sheet(tree).onClosed())
    expect(onInvite).toHaveBeenCalledWith({ inboxId: 'inbox-cal', name: 'Cal' })
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('offers no one once the car is full, counting open invitations', () => {
    seedCar(7)
    const tree = render()
    expect(texts(tree)).toContain(
      'This car already has the most people it can.'
    )
    expect(choices(tree).map(({ props }) => props.disabled)).toEqual([
      true,
      true,
      true,
    ])
    expect(choices(tree).flatMap(({ texts: t }) => t)).not.toContain('Invite')
  })

  it('isn’t full with one place left', () => {
    seedCar(6)
    const tree = render()
    expect(texts(tree)).not.toContain(
      'This car already has the most people it can.'
    )
    expect(choices(tree)[2].props.disabled).toBe(false)
  })

  it('points to Buddies when the User has no buddies to invite', () => {
    mocks.buddies = []
    const tree = render(null)
    expect(mocks.carBuddies).not.toHaveBeenCalled()
    expect(texts(tree)).toContain(
      'You can share a car with your buddies. Invite someone to Buddies first, then share this car with them.'
    )
    expect(choices(tree)).toHaveLength(0)

    const [button] = goToBuddies(tree)
    expect(button.props.children).toBe('Go to Buddies')
    act(() => button.props.onPress())
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mocks.navigate).not.toHaveBeenCalled()
    act(() => sheet(tree).onClosed())
    expect(mocks.navigate).toHaveBeenCalledWith('Buddies')
    expect(onInvite).not.toHaveBeenCalled()
  })

  it('points to Buddies when none of the car’s buddies is still one', () => {
    mocks.carBuddies.mockImplementation(() => [])
    const tree = render()
    expect(choices(tree)).toHaveLength(0)
    expect(goToBuddies(tree).map((node) => node.props.children)).toEqual([
      'Go to Buddies',
    ])
  })

  it('offers no Go to Buddies while there are buddies to choose from', () => {
    expect(goToBuddies(render())).toHaveLength(0)
  })
})
