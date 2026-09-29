import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated' }))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)

import useContacts from '@/stores/contactsStore'
import type { Contact } from '@/types/contact'

const contact = (id: string, overrides: Partial<Contact> = {}) =>
  ({ id, name: id, createdAt: new Date(0), ...overrides }) as Contact

const until = new Date('2030-01-01')

beforeEach(() => {
  useContacts.setState({
    contacts: [
      contact('a'),
      contact('b', { dismissedUntil: until, dismissedNotificationId: 'r' }),
      contact('c'),
    ],
  })
})

describe('batch dismiss', () => {
  it('dismisses the given contacts in one update', () => {
    const listener = vi.fn()
    const unsubscribe = useContacts.subscribe(listener)
    useContacts.getState().dismissContacts([
      { id: 'a', dismissedUntil: until, dismissedNotificationId: 'n1' },
      { id: 'c', dismissedUntil: until },
    ])
    unsubscribe()

    expect(listener).toHaveBeenCalledTimes(1)
    const [a, b, c] = useContacts.getState().contacts
    expect(a).toMatchObject({
      dismissedUntil: until,
      dismissedNotificationId: 'n1',
    })
    expect(c.dismissedUntil).toEqual(until)
    expect(c.dismissedNotificationId).toBeUndefined()
    expect(b.updatedAt).toBeUndefined()
  })

  it('undismisses the given contacts in one update', () => {
    const listener = vi.fn()
    const unsubscribe = useContacts.subscribe(listener)
    useContacts.getState().undismissContacts(['b'])
    unsubscribe()

    expect(listener).toHaveBeenCalledTimes(1)
    const b = useContacts.getState().contacts[1]
    expect(b).not.toHaveProperty('dismissedUntil')
    expect(b).not.toHaveProperty('dismissedNotificationId')
    expect(b.updatedAt).toEqual(expect.any(Number))
  })
})

describe('batch delete', () => {
  it('archives the given contacts in one update', () => {
    useContacts.setState({ deletedContacts: [contact('a')] })
    const listener = vi.fn()
    const unsubscribe = useContacts.subscribe(listener)
    useContacts.getState().deleteContacts(['a', 'c', 'missing'])
    unsubscribe()

    expect(listener).toHaveBeenCalledTimes(1)
    const { contacts, deletedContacts } = useContacts.getState()
    expect(contacts.map((c) => c.id)).toEqual(['b'])
    expect(deletedContacts.map((c) => c.id)).toEqual(['a', 'c'])
    expect(deletedContacts[0].name).toBe('a')
  })

  it('leaves only tombstones when redacting', () => {
    useContacts.setState({ deletedContacts: [] })
    useContacts.getState().deleteContacts(['a'], { redact: true })
    const [tombstone] = useContacts.getState().deletedContacts
    expect(tombstone.id).toBe('a')
    expect(tombstone.name).not.toBe('a')
  })
})
