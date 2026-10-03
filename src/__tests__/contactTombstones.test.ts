import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated' }))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import useContacts from '@/stores/contactsStore'
import {
  DELETED_CONTACT_RETENTION_MS,
  expireDeletedContactDetails,
} from '@/lib/contactRetention'
import {
  isRedactedContactTombstone,
  stripContactForTombstone,
} from '@/lib/dataProtection'
import {
  deviceFromStores,
  emptyDevice,
  pullFrom,
} from '@/__tests__/helpers/syncPeer'
import type { Contact } from '@/types/contact'

const NOW = new Date('2026-10-01T12:00:00.000Z').getTime()

const householder = (id: string, updatedAt: number): Contact => ({
  id,
  name: `Name ${id}`,
  phone: '+15550100',
  address: { line1: '12 Oak St', city: 'Springfield' },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt,
})

const setContacts = (contacts: Contact[], deletedContacts: Contact[]) =>
  useContacts.getState().set({
    contacts,
    deletedContacts,
    customFieldDefs: [],
    deletedCustomFieldDefs: [],
  })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  setContacts([], [])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('removeDeletedContact (Delete permanently)', () => {
  it('replaces the archived contact with a redacted tombstone', () => {
    setContacts([], [householder('a', NOW - 60_000)])

    useContacts.getState().removeDeletedContact('a')

    const { deletedContacts } = useContacts.getState()
    expect(deletedContacts).toHaveLength(1)
    const [tombstone] = deletedContacts
    expect(isRedactedContactTombstone(tombstone)).toBe(true)
    expect(Object.keys(tombstone).sort()).toEqual([
      'createdAt',
      'id',
      'name',
      'redacted',
      'updatedAt',
    ])
    expect(tombstone.updatedAt).toBe(NOW)
    expect(JSON.stringify(tombstone)).not.toContain('Oak St')
  })

  it('stamps the tombstone newer than the archived copy, even in the same millisecond', () => {
    setContacts(
      [],
      [householder('same-ms', NOW), householder('ahead', NOW + 5)]
    )

    useContacts.getState().removeDeletedContact('same-ms')
    useContacts.getState().removeDeletedContact('ahead')

    const byId = new Map(
      useContacts.getState().deletedContacts.map((c) => [c.id, c])
    )
    expect(byId.get('same-ms')?.updatedAt).toBe(NOW + 1)
    expect(byId.get('ahead')?.updatedAt).toBe(NOW + 6)
  })

  it('leaves unknown ids and existing tombstones untouched', () => {
    const tombstone = stripContactForTombstone(
      householder('t', NOW - 10),
      NOW - 10
    )
    setContacts([], [tombstone])

    useContacts.getState().removeDeletedContact('t')
    useContacts.getState().removeDeletedContact('missing')

    expect(useContacts.getState().deletedContacts).toEqual([tombstone])
  })

  it('removes the contact from devices holding the archived or a stale active copy', () => {
    const archivedAt = NOW - 60_000
    setContacts([], [householder('a', archivedAt)])
    // Devices that synced before the permanent delete: one has the archive,
    // one still has the contact active from an older file.
    const archivingPeer = deviceFromStores()
    const stalePeer = emptyDevice({
      contacts: [householder('a', archivedAt - 60_000)],
    })

    useContacts.getState().removeDeletedContact('a')
    const local = deviceFromStores()

    for (const peer of [archivingPeer, stalePeer]) {
      const merged = pullFrom(peer, local)
      expect(merged.contacts).toEqual([])
      expect(merged.deletedContacts).toHaveLength(1)
      expect(isRedactedContactTombstone(merged.deletedContacts[0])).toBe(true)
      expect(JSON.stringify(merged)).not.toContain('Oak St')

      // Their stale files can't bring the contact back here either.
      const back = pullFrom(local, peer)
      expect(back.contacts).toEqual([])
      expect(back.deletedContacts).toEqual(local.deletedContacts)
    }
  })
})

describe('addContact', () => {
  it('still skips an id that is active or waiting in Recover Contacts', () => {
    setContacts([householder('a', 1)], [householder('b', 1)])

    useContacts.getState().addContact({ ...householder('a', 1), name: 'New' })
    useContacts.getState().addContact({ ...householder('b', 1), name: 'New' })

    const { contacts, deletedContacts } = useContacts.getState()
    expect(contacts.map((c) => c.name)).toEqual(['Name a'])
    expect(deletedContacts.map((c) => c.name)).toEqual(['Name b'])
  })

  it('replaces a redacted tombstone, stamped newer than the tombstone', () => {
    // A tombstone from a device whose clock runs ahead of this one.
    setContacts(
      [],
      [
        stripContactForTombstone(householder('a', 1), NOW + 5_000),
        stripContactForTombstone(householder('b', 1), NOW - 5_000),
      ]
    )

    useContacts.getState().addContact({ ...householder('a', 1), name: 'Ana' })
    useContacts.getState().addContact({ ...householder('b', 1), name: 'Bea' })

    const { contacts, deletedContacts } = useContacts.getState()
    expect(contacts.map((c) => [c.name, c.updatedAt])).toEqual([
      ['Ana', NOW + 5_001],
      ['Bea', NOW],
    ])
    expect(deletedContacts).toEqual([])
  })

  it('replaces a contact whose archived details expired after 90 days', () => {
    const archived = householder('a', NOW - DELETED_CONTACT_RETENTION_MS - 1)
    setContacts([], expireDeletedContactDetails([archived], NOW))
    expect(useContacts.getState().deletedContacts[0].redacted).toBe(true)

    useContacts.getState().addContact({ ...householder('a', 1), name: 'Ana' })

    expect(useContacts.getState().contacts.map((c) => c.name)).toEqual(['Ana'])
    expect(useContacts.getState().deletedContacts).toEqual([])
  })

  it('a re-added contact wins over the tombstone on other devices', () => {
    setContacts([], [stripContactForTombstone(householder('a', 1), NOW)])
    const peerWithTombstone = deviceFromStores()

    vi.setSystemTime(NOW + 60_000)
    useContacts.getState().addContact(householder('a', 1))
    const local = deviceFromStores()

    const merged = pullFrom(peerWithTombstone, local)
    expect(merged.contacts.map((c) => c.id)).toEqual(['a'])
    expect(merged.deletedContacts).toEqual([])

    const back = pullFrom(local, peerWithTombstone)
    expect(back.contacts.map((c) => c.id)).toEqual(['a'])
    expect(back.deletedContacts).toEqual([])
  })
})

describe('re-adding a contact over its redacted tombstone', () => {
  const ERASED_AT = NOW - 60_000

  it('marks the re-add at its own stamp, and only a re-add', () => {
    setContacts([], [stripContactForTombstone(householder('a', 1), ERASED_AT)])

    useContacts.getState().addContact(householder('a', 1))
    // A marker from an imported file describes another device's history.
    useContacts
      .getState()
      .addContact({ ...householder('b', 1), readdedAt: ERASED_AT })

    const [readded, fresh] = useContacts.getState().contacts
    expect(readded.readdedAt).toBe(NOW)
    expect(readded.updatedAt).toBe(NOW)
    expect(fresh).not.toHaveProperty('readdedAt')
  })

  it('keeps the marker through edits and a normal delete, not a permanent one', () => {
    setContacts([], [stripContactForTombstone(householder('a', 1), ERASED_AT)])
    useContacts.getState().addContact(householder('a', 1))

    vi.setSystemTime(NOW + 1_000)
    useContacts.getState().updateContact({ id: 'a', name: 'Renamed' })
    useContacts.getState().toggleFavoriteContact('a')
    useContacts.getState().deleteContact('a')

    const [archived] = useContacts.getState().deletedContacts
    expect(archived).toMatchObject({ name: 'Renamed', readdedAt: NOW })

    useContacts.getState().recoverContact('a')
    expect(useContacts.getState().contacts[0].readdedAt).toBe(NOW)
    useContacts.getState().deleteContacts(['a'])
    useContacts.getState().removeDeletedContact('a')

    const [tombstone] = useContacts.getState().deletedContacts
    expect(Object.keys(tombstone).sort()).toEqual([
      'createdAt',
      'id',
      'name',
      'redacted',
      'updatedAt',
    ])
  })

  it('stays in Recover Contacts on devices still holding the old tombstone', () => {
    setContacts([], [stripContactForTombstone(householder('a', 1), ERASED_AT)])
    const stalePeer = deviceFromStores()

    useContacts.getState().addContact(householder('a', 1))
    vi.setSystemTime(NOW + 60_000)
    useContacts.getState().deleteContact('a')
    const local = deviceFromStores()

    for (const merged of [
      pullFrom(stalePeer, local),
      pullFrom(local, stalePeer),
    ]) {
      expect(merged.contacts).toEqual([])
      expect(merged.deletedContacts.map((c) => [c.name, c.redacted])).toEqual([
        ['Name a', undefined],
      ])
    }
  })

  it('is redacted again by a later Delete permanently', () => {
    setContacts([], [stripContactForTombstone(householder('a', 1), ERASED_AT)])
    useContacts.getState().addContact(householder('a', 1))
    vi.setSystemTime(NOW + 60_000)
    useContacts.getState().deleteContact('a')
    const archivingPeer = deviceFromStores()

    vi.setSystemTime(NOW + 120_000)
    useContacts.getState().removeDeletedContact('a')
    const local = deviceFromStores()

    for (const merged of [
      pullFrom(archivingPeer, local),
      pullFrom(local, archivingPeer),
    ]) {
      expect(merged.deletedContacts).toEqual(local.deletedContacts)
      expect(JSON.stringify(merged)).not.toContain('Oak St')
    }
  })
})
