import { createElement, type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A buddy who changed their account key shows Reconnect and Dismiss wherever
// the pairing does: their row in Buddies (or a row of its own once the old
// pairing is gone), and their screen.

const fake = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  accept: vi.fn(async () => ({ claimed: true })),
  dismiss: vi.fn(),
  alert: vi.fn(),
  capture: vi.fn(),
  success: vi.fn(),
  navigate: vi.fn(),
}))

function passthrough({ children }: { children?: ReactNode }) {
  return createElement('view', null, children)
}

vi.mock('react-native', () => ({
  View: passthrough,
  Alert: { alert: fake.alert },
  Platform: { OS: 'ios' },
}))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: fake.navigate }),
}))
vi.mock('lucide-react-native', () => ({ X: 'X' }))
vi.mock('@/components/ui/Button', () => ({
  default: (props: object) => createElement('button', props),
}))
vi.mock('@/components/ui/ActionButton', () => ({
  default: (props: object) => createElement('action', props),
}))
vi.mock('@/components/ui/IconButton', () => ({
  default: (props: object) => createElement('iconbutton', props),
}))
vi.mock('@/components/ui/Card', () => ({ default: passthrough }))
vi.mock('@/components/ui/MyText', () => ({ default: passthrough }))
vi.mock('@/components/ui/layout/XView', () => ({ default: passthrough }))
vi.mock('@/components/ui/touchTarget', () => ({ MIN_TOUCH_TARGET: 44 }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: { accent: '#0a0', textInverse: '#fff', textAlt: '#666' },
    fonts: { semiBold: 'SemiBold', bold: 'Bold' },
    fontSize: () => 16,
  }),
}))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}:${options.name}` : key,
  },
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: fake.capture } }))
vi.mock('@/lib/userAction', () => ({ noteUserAction: vi.fn() }))
vi.mock('@/stores/toasts', () => ({ toast: { success: fake.success } }))
vi.mock('@/features/buddies/stores/buddiesStore', () => ({
  useBuddies: (select: (state: unknown) => unknown) => select(fake.state),
}))
vi.mock('@/features/buddies/lib/buddiesService', () => ({
  buddiesEngine: {
    acceptReconnect: fake.accept,
    dismissReconnect: fake.dismiss,
  },
}))
vi.mock('@/features/buddies/lib/buddyProfile', () => ({
  buddyDisplayName: (buddy: { name: string; nickname?: string }) =>
    buddy.nickname ?? buddy.name,
  buddyStreakCount: () => 0,
  buddyTenureLabel: () => 'tenure',
}))
vi.mock('@/components/ui/DirectionalIcon', () => ({ ChevronForwardIcon: 'C' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: () => null }))
vi.mock('@/components/ui/PullDownMenu', () => ({ default: () => null }))
vi.mock('@/components/StreakBadge', () => ({ default: () => null }))
vi.mock('@/features/buddies/lib/buddyConfirmations', () => ({
  confirmRemoveBuddy: vi.fn(),
  confirmWithdrawRequest: vi.fn(),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (select: (state: unknown) => unknown) =>
    select({ showStreaks: false }),
}))
vi.mock('@/features/buddies/lib/buddiesErrorAlert', () => ({
  alertBuddiesError: vi.fn(),
}))
vi.mock('@/features/buddies/components/BuddyAvatar', () => ({
  default: () => null,
}))
vi.mock('@/features/buddies/components/BuddyListRow', () => ({
  default: (props: object) => createElement('row', props),
}))

const { default: ReconnectButtons } = await import(
  '@/features/buddies/components/ReconnectButtons'
)
const { default: ReconnectRequestRow } = await import(
  '@/features/buddies/components/ReconnectRequestRow'
)
const { default: BuddyReconnectCard } = await import(
  '@/features/buddies/components/BuddyReconnectCard'
)
const { default: BuddyRow } = await import(
  '@/features/buddies/components/BuddyRow'
)

const offer = {
  invites: [],
  expiresAt: Date.now() + 60_000,
  name: 'Anna',
  nickname: 'Annie',
  colorIndex: 0,
}

function render(element: ReturnType<typeof createElement>) {
  let tree!: ReactTestRenderer
  act(() => {
    tree = create(element)
  })
  return tree
}

const pressed = async (node: { props: { [key: string]: unknown } }) => {
  await act(async () => {
    await (node.props.onPress as () => unknown)()
  })
}

describe('a buddy’s reconnect', () => {
  beforeEach(() => {
    fake.state = { reconnectOffers: { old: offer } }
    vi.clearAllMocks()
  })

  it('reconnects with one tap, by the name this User gave them', async () => {
    const tree = render(createElement(ReconnectButtons, { from: 'old' }))
    const reconnect = tree.root.findByType('button' as never)
    await pressed(reconnect)
    expect(fake.accept).toHaveBeenCalledWith('old')
    expect(fake.capture).toHaveBeenCalledWith('buddy_reconnect_claimed')
    expect(fake.success).toHaveBeenCalledWith('buddies_awaitingConfirm:Annie')
  })

  it('dismisses only once the User confirms, ending the old pairing', async () => {
    const tree = render(createElement(ReconnectButtons, { from: 'old' }))
    const dismiss = tree.root.findByType('iconbutton' as never)
    expect(dismiss.props.accessibilityLabel).toBe('dismiss')
    await pressed(dismiss)
    expect(fake.dismiss).not.toHaveBeenCalled()
    const [, , buttons] = fake.alert.mock.calls[0] as [
      string,
      string,
      { style?: string; onPress?: () => void }[],
    ]
    buttons.find((button) => button.style === 'destructive')!.onPress!()
    expect(fake.dismiss).toHaveBeenCalledWith('old')
  })

  it('shows nothing once the offer is gone or lapsed', () => {
    fake.state = { reconnectOffers: {} }
    expect(
      render(createElement(ReconnectButtons, { from: 'old' })).toJSON()
    ).toBeNull()
    fake.state = {
      reconnectOffers: { old: { ...offer, expiresAt: Date.now() - 1 } },
    }
    expect(
      render(createElement(BuddyReconnectCard, { from: 'old' })).toJSON()
    ).toBeNull()
  })

  it('lists an offer whose old pairing is gone as a request of its own', () => {
    const tree = render(
      createElement(ReconnectRequestRow, { from: 'old', last: true })
    )
    const row = tree.root.findByType('row' as never)
    expect(row.props.title).toBe('Annie')
    expect(row.props.subtitle).toBe('buddies_reconnectAsked')
    expect(
      (row.props.actions as { id: string }[][]).flat().map((a) => a.id)
    ).toEqual(['reconnect', 'dismiss'])
  })

  it('says so on the buddy’s row, with Reconnect and Dismiss', () => {
    fake.state = {
      reconnectOffers: { old: offer },
      sharing: {},
    }
    const buddy = {
      inboxId: 'old',
      name: 'Anna',
      nickname: 'Annie',
      status: 'active' as const,
      dhPub: 'd',
      inviteSecret: 's',
      colorIndex: 0,
      pairedAt: 0,
    }
    const row = render(
      createElement(BuddyRow, { buddy, last: true })
    ).root.findByType('row' as never)
    expect(row.props.subtitle).toBe('buddies_reconnectAsked')
    expect(row.props.trailing.props.from).toBe('old')
    expect(
      (row.props.actions as { id: string }[][])[0].map((a) => a.id)
    ).toEqual(['reconnect', 'dismiss_reconnect'])

    // Without an offer it's an ordinary buddy again.
    fake.state = { reconnectOffers: {}, sharing: {} }
    const plain = render(
      createElement(BuddyRow, { buddy, last: true })
    ).root.findByType('row' as never)
    expect(plain.props.subtitle).toBe('buddies_sharingPlans')
    expect(plain.props.trailing).toBeUndefined()
  })

  it('offers both on the buddy’s screen', async () => {
    const tree = render(createElement(BuddyReconnectCard, { from: 'old' }))
    const reconnect = tree.root.findByType('action' as never)
    await pressed(reconnect)
    expect(fake.accept).toHaveBeenCalledWith('old')
    const dismiss = tree.root.findByType('button' as never)
    await pressed(dismiss)
    expect(fake.alert).toHaveBeenCalled()
  })
})
