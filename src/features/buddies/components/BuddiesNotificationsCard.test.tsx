import { createElement, type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  notifications: true,
  permission: {
    granted: false as boolean | null,
    needsSettings: false,
    turnOn: vi.fn(),
  },
  state: {
    notificationsEnabled: true,
    outgoingInvites: [{ id: 'invite' }],
    buddies: [] as { status: string }[],
  },
}))

function passthrough({ children }: { children?: ReactNode }) {
  return createElement('view', null, children)
}

vi.mock('@/components/ui/ActionButton', () => ({
  default: (props: object) => createElement('action', props),
}))
vi.mock('@/components/ui/Card', () => ({ default: passthrough }))
vi.mock('@/components/ui/MyText', () => ({ default: passthrough }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/platformCapabilities', () => ({
  hasCapability: (capability: string) =>
    capability === 'deviceNotifications' ? fake.notifications : true,
}))
vi.mock('@/features/buddies/hooks/useNotificationPermission', () => ({
  default: () => fake.permission,
}))
vi.mock('@/features/buddies/stores/buddiesStore', () => ({
  useBuddies: (select: (state: unknown) => unknown) => select(fake.state),
}))

import BuddiesNotificationsCard from '@/features/buddies/components/BuddiesNotificationsCard'

let root: ReactTestRenderer

const render = async () => {
  await act(async () => {
    root = create(<BuddiesNotificationsCard />)
  })
}

const button = () => root.root.findAllByType('action' as never)[0]

beforeEach(() => {
  fake.notifications = true
  fake.permission.granted = false
  fake.permission.needsSettings = false
})

describe('BuddiesNotificationsCard', () => {
  it('asks to turn notifications on while a buddy is waiting', async () => {
    await render()
    expect(button().props.children).toBe('buddies_enableNotifications')
    expect(button().props.onPress).toBe(fake.permission.turnOn)
  })

  it('sends people to Settings once the phone stops asking', async () => {
    fake.permission.needsSettings = true
    await render()
    expect(button().props.children).toBe('buddies_openSettings')
  })

  it('stays hidden in a browser, which never gets Buddies alerts', async () => {
    fake.notifications = false
    fake.permission.needsSettings = true
    await render()
    expect(root.toJSON()).toBeNull()
  })
})
