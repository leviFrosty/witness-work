import { createElement, type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Accepting an invite can take a while on a slow connection: the button says
// it's working, a second tap starts nothing, and a User who left meanwhile
// isn't sent back from the screen they moved on to.

const fake = vi.hoisted(() => ({
  accept: null as null | {
    resolve: (value: { name: string }) => void
    reject: (error: Error) => void
  },
  accepts: 0,
  focused: true,
  goBack: vi.fn(),
  alert: vi.fn(),
}))

function passthrough({ children }: { children?: ReactNode }) {
  return createElement('view', null, children)
}

vi.mock('react-native', () => ({
  View: passthrough,
  ScrollView: passthrough,
  ActivityIndicator: () => null,
  Alert: { alert: fake.alert },
}))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    isFocused: () => fake.focused,
    goBack: fake.goBack,
    navigate: vi.fn(),
  }),
}))
vi.mock('@/components/ui/ActionButton', () => ({
  default: (props: object) => createElement('action', props),
}))
vi.mock('@/components/ui/Card', () => ({ default: passthrough }))
vi.mock('@/components/ui/MyText', () => ({ default: passthrough }))
vi.mock('@/components/ui/layout/Wrapper', () => ({ default: passthrough }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: { textAlt: '#666', error: '#f00' },
    fonts: { bold: 'Bold' },
    fontSize: () => 16,
  }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/stores/profile', () => ({
  useProfile: (select: (s: { name: string }) => unknown) =>
    select({ name: 'Sam' }),
}))
vi.mock('@/features/buddies/components/BuddyAvatar', () => ({
  default: () => null,
}))
vi.mock('@/features/buddies/components/InviteShareSummary', () => ({
  default: () => null,
}))
vi.mock('@/features/buddies/lib/buddiesService', () => ({
  buddiesEngine: {
    previewInvite: async () => ({ name: 'Ada', expiresAt: 0 }),
    acceptInvite: () => {
      fake.accepts += 1
      return new Promise((resolve, reject) => {
        fake.accept = { resolve, reject }
      })
    },
  },
}))
vi.mock('@/features/buddies/lib/buddiesErrorAlert', () => ({
  alertBuddiesError: vi.fn(),
}))
vi.mock('@/features/buddies/lib/buddiesErrors', () => ({
  buddiesErrorMessage: () => 'error',
  isRetryableBuddiesError: () => true,
}))
vi.mock('@/features/buddies/lib/buddyProfile', () => ({
  buddyTenureLabel: () => '',
}))
vi.mock('@/features/buddies/stores/buddiesStore', () => ({
  useBuddies: { getState: () => ({ onboardingComplete: true }) },
}))
vi.mock('@/lib/userAction', () => ({ noteUserAction: vi.fn() }))
vi.mock('@/lib/dates', () => ({ formatRelative: () => 'soon' }))

import BuddyInviteScreen from '@/features/buddies/screens/BuddyInviteScreen'

let renderer: ReactTestRenderer | undefined

const acceptButton = () =>
  renderer!.root
    .findAllByType('action' as never)
    .find((node) => node.props.children === 'buddies_accept')!

async function open() {
  await act(async () => {
    renderer = create(
      createElement(BuddyInviteScreen, {
        route: { params: { link: 'https://example.test/i#x' } },
      } as never)
    )
  })
}

beforeEach(() => {
  fake.accept = null
  fake.accepts = 0
  fake.focused = true
  vi.clearAllMocks()
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

describe('BuddyInviteScreen accept', () => {
  it('shows it is working and ignores a second tap until it answers', async () => {
    await open()
    await act(async () => {
      void acceptButton().props.onPress()
      void acceptButton().props.onPress()
    })
    expect(fake.accepts).toBe(1)
    expect(acceptButton().props.loading).toBe(true)

    await act(async () => fake.accept!.resolve({ name: 'Ada' }))
    expect(acceptButton().props.loading).toBe(false)
    expect(fake.alert).toHaveBeenCalledWith(
      'buddies_inviteSentTitle',
      'buddies_inviteSentBody'
    )
    expect(fake.goBack).toHaveBeenCalledTimes(1)
  })

  it("doesn't go back from a screen the User moved on to", async () => {
    await open()
    await act(async () => {
      void acceptButton().props.onPress()
    })
    fake.focused = false
    await act(async () => fake.accept!.resolve({ name: 'Ada' }))
    expect(fake.alert).toHaveBeenCalled()
    expect(fake.goBack).not.toHaveBeenCalled()
  })
})
