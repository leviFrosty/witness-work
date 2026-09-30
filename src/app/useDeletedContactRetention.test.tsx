import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import type { Contact } from '@/types/contact'
const runtime = vi.hoisted(() => ({
  platform: 'ios',
  foreground: (_: string) => {},
}))
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
  AppState: {
    addEventListener: (_: string, listener: (state: string) => void) => {
      runtime.foreground = listener
      return { remove: vi.fn() }
    },
  },
}))
vi.mock('@/stores/contactsStore', async () => ({
  default: (await import('zustand')).create<{
    deletedContacts: Contact[]
    set: (value: { deletedContacts: Contact[] }) => void
  }>((set) => ({ deletedContacts: [], set })),
}))
import useContacts from '@/stores/contactsStore'
import { useDeletedContactRetention } from './useDeletedContactRetention'
import { DELETED_CONTACT_RETENTION_MS } from '@/lib/contactRetention'
const Harness = () => {
  useDeletedContactRetention(true)
  return null
}
let renderer: ReactTestRenderer | undefined
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.useRealTimers()
})

it.each(['ios', 'android'])(
  'expires deleted details on %s without sync',
  async (platform) => {
    runtime.platform = platform
    vi.useFakeTimers()
    const now = Date.now()
    vi.setSystemTime(now)
    useContacts.setState({
      deletedContacts: [
        {
          id: 'c',
          name: 'Private',
          phone: '123',
          createdAt: new Date(0),
          updatedAt: now - DELETED_CONTACT_RETENTION_MS + 1000,
        },
      ],
    })
    await act(async () => {
      renderer = create(<Harness />)
    })
    expect(useContacts.getState().deletedContacts[0].name).toBe('Private')
    vi.setSystemTime(now + 2000)
    await act(async () => {
      runtime.foreground('active')
    })
    expect(useContacts.getState().deletedContacts[0]).toMatchObject({
      id: 'c',
      name: '',
      redacted: true,
    })
    expect(useContacts.getState().deletedContacts[0].phone).toBeUndefined()
  }
)
