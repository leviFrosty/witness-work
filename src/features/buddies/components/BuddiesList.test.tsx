import { createElement, type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initialBuddiesState } from '@/features/buddies/lib/state'

// A buddy who changed their account key asked to reconnect: Buddies shows it,
// on their row while the old pairing lasts, and as a request of its own once
// their old key left it. Found on a device, where the list showed the old
// pairing as an ordinary buddy.

const fake = vi.hoisted(() => ({ state: {} as Record<string, unknown> }))

function passthrough({ children }: { children?: ReactNode }) {
  return createElement('view', null, children)
}

vi.mock('react-native', () => ({
  View: passthrough,
  ActivityIndicator: () => null,
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios' },
}))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: vi.fn() }),
}))
vi.mock('lucide-react-native', () => ({ Users: 'Users' }))
vi.mock('@/components/ui/ActionButton', () => ({ default: passthrough }))
vi.mock('@/components/ui/Button', () => ({ default: passthrough }))
vi.mock('@/components/ui/Empty', () => ({
  default: () => createElement('empty'),
}))
vi.mock('@/components/ui/LucideIcon', () => ({ default: () => null }))
vi.mock('@/components/ui/MyText', () => ({ default: passthrough }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, fonts: {}, fontSize: () => 16 }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/features/buddies/stores/buddiesStore', () => ({
  useBuddies: (select: (state: unknown) => unknown) => select(fake.state),
}))
vi.mock('@/features/buddies/components/BuddiesSection', () => ({
  default: ({ title, children }: { title: string; children?: ReactNode }) =>
    createElement('section', { title }, children),
}))
for (const [path, tag] of [
  ['@/features/buddies/components/BuddyRow', 'buddyrow'],
  ['@/features/buddies/components/BuddyRequestRow', 'requestrow'],
  ['@/features/buddies/components/PendingInviteRow', 'inviterow'],
  ['@/features/buddies/components/ReconnectRequestRow', 'reconnectrow'],
] as const)
  vi.doMock(path, () => ({
    default: (props: object) => createElement(tag, props),
  }))

const { default: BuddiesList } = await import(
  '@/features/buddies/components/BuddiesList'
)

const offer = {
  invites: [],
  expiresAt: Date.now() + 60_000,
  name: 'Mom',
  colorIndex: 0,
}
const mom = {
  inboxId: 'old',
  name: 'Mom',
  status: 'active',
  dhPub: 'd',
  inviteSecret: 's',
  colorIndex: 0,
  pairedAt: 0,
}

function render() {
  let tree!: ReactTestRenderer
  act(() => {
    tree = create(createElement(BuddiesList, { onInvite: () => {} }))
  })
  return tree
}

describe('Buddies with a reconnect on offer', () => {
  beforeEach(() => {
    fake.state = { ...initialBuddiesState }
  })

  it('leaves it to the buddy’s row while the old pairing lasts', () => {
    fake.state = {
      ...initialBuddiesState,
      buddies: [mom],
      reconnectOffers: { old: offer },
    }
    const tree = render()
    expect(tree.root.findAllByType('reconnectrow' as never)).toHaveLength(0)
    expect(tree.root.findByType('buddyrow' as never).props.buddy.inboxId).toBe(
      'old'
    )
  })

  it('lists it with the requests once the old pairing is gone', () => {
    fake.state = { ...initialBuddiesState, reconnectOffers: { old: offer } }
    const tree = render()
    expect(tree.root.findAllByType('empty' as never)).toHaveLength(0)
    const section = tree.root.findByType('section' as never)
    expect(section.props.title).toBe('buddies_requestsSection')
    const [row] = tree.root.findAllByType('reconnectrow' as never)
    expect(row.props).toMatchObject({ from: 'old', last: true })
  })

  it('stops listing it once it lapsed', () => {
    fake.state = {
      ...initialBuddiesState,
      reconnectOffers: { old: { ...offer, expiresAt: Date.now() - 1 } },
    }
    expect(render().root.findAllByType('empty' as never)).toHaveLength(1)
  })
})
