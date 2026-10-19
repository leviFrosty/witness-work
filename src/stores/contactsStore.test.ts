import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn() },
}))
import useContacts from '@/stores/contactsStore'
import type { Contact } from '@/types/contact'

const contact = (id: string, updatedAt?: number): Contact =>
  ({
    id,
    name: `Contact ${id}`,
    createdAt: new Date('2026-01-01T12:00:00Z'),
    updatedAt,
  }) as Contact

const seed = () =>
  useContacts.setState({
    contacts: [contact('a', 1_000), contact('b'), contact('c', 3_000)],
    deletedContacts: [],
  })

const state = () => {
  const { contacts, deletedContacts } = useContacts.getState()
  return { contacts, deletedContacts }
}

describe('contacts store single and Select-mode actions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
    seed()
  })

  it('deletes one contact exactly as a one-item batch does', () => {
    useContacts.getState().deleteContact('a')
    const single = state()
    seed()
    useContacts.getState().deleteContacts(['a'])
    expect(state()).toEqual(single)
    expect(single.contacts.map((c) => c.id)).toEqual(['b', 'c'])
    expect(single.deletedContacts).toMatchObject([
      { id: 'a', name: 'Contact a' },
    ])
    expect(single.deletedContacts[0].updatedAt).toBeGreaterThan(1_000)
  })

  it('redacts a deleted contact down to its id and stamp', () => {
    useContacts.getState().deleteContact('a', { redact: true })
    const [tombstone] = state().deletedContacts
    expect(tombstone.id).toBe('a')
    expect(tombstone.name).not.toBe('Contact a')
  })

  it('leaves the state untouched when deleting an unknown contact', () => {
    const before = state()
    useContacts.getState().deleteContact('missing')
    expect(state().contacts).toBe(before.contacts)
    expect(state().deletedContacts).toBe(before.deletedContacts)
  })

  it('stamps a batch delete newer than every deleted contact', () => {
    useContacts.getState().deleteContacts(['a', 'b', 'c'])
    const stamps = state().deletedContacts.map((c) => c.updatedAt)
    expect(new Set(stamps).size).toBe(1)
    expect(stamps[0]).toBeGreaterThan(3_000)
  })

  it('dismisses and undismisses one contact exactly as a batch does', () => {
    const until = new Date('2026-11-01T12:00:00Z')
    useContacts.getState().dismissContact('b', until, 'notification-b')
    const dismissed = state()
    expect(dismissed.contacts[1]).toMatchObject({
      dismissedUntil: until,
      dismissedNotificationId: 'notification-b',
    })
    useContacts.getState().undismissContact('b')
    const undismissed = state()
    expect(undismissed.contacts[1]).not.toHaveProperty('dismissedUntil')
    expect(undismissed.contacts[1]).not.toHaveProperty(
      'dismissedNotificationId'
    )

    seed()
    useContacts.getState().dismissContacts([
      {
        id: 'b',
        dismissedUntil: until,
        dismissedNotificationId: 'notification-b',
      },
    ])
    expect(state()).toEqual(dismissed)
    useContacts.getState().undismissContacts(['b'])
    expect(state()).toEqual(undismissed)
  })
})
