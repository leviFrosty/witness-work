import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact, Coordinate } from '@/types/contact'

const runtime = vi.hoisted(() => ({ offline: false }))

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/lib/address', () => ({ fetchCoordinateFromAddress: vi.fn() }))
vi.mock('@/lib/appLifecycle', () => ({
  addForegroundListener: () => ({ remove: () => {} }),
}))
vi.mock('@/lib/http/online', () => ({
  isKnownOffline: () => runtime.offline,
  addReconnectListener: () => ({ remove: () => {} }),
}))
vi.mock('@/stores/contactsStore', async () => {
  const { create } = await import('zustand')
  const store = create<{
    contacts: Contact[]
    updateContact: (patch: Partial<Contact> & { id: string }) => void
  }>((set) => ({
    contacts: [],
    updateContact: (patch) =>
      set(({ contacts }) => ({
        contacts: contacts.map((c) =>
          c.id === patch.id ? { ...c, ...patch } : c
        ),
      })),
  }))
  return { default: store, useContacts: store }
})
vi.mock('@/stores/preferences', async () => ({
  usePreferences: (await import('zustand')).create(() => ({
    dataProtectionMode: false,
    incrementGeocodeApiCallCount: () => {},
  })),
}))

import { fetchCoordinateFromAddress } from '@/lib/address'
import { geocodeRetryKey } from '@/lib/geocodeRetry'
import useContacts from '@/stores/contactsStore'
import { useGeocodeRetry } from '@/stores/geocodeRetry'
import { usePreferences } from '@/stores/preferences'
import { retryFailedGeocodes } from './geocodeRetry'

const fetchCoordinate = vi.mocked(fetchCoordinateFromAddress)
const found: Coordinate = { latitude: 39.78, longitude: -89.65 }
const failure = (kind: string) => Object.assign(new Error(kind), { kind })

const contact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'c1',
  name: 'Sam Rivera',
  createdAt: new Date('2026-01-01'),
  address: { line1: '12 Maple St', city: 'Springfield' },
  ...overrides,
})

const saved = (id = 'c1') =>
  useContacts.getState().contacts.find((c) => c.id === id)
const queue = () => useGeocodeRetry.getState().queue

beforeEach(() => {
  runtime.offline = false
  fetchCoordinate.mockReset()
  usePreferences.setState({ dataProtectionMode: false })
  useContacts.setState({ contacts: [contact()] })
  useGeocodeRetry.setState({ queue: [] })
  useGeocodeRetry.getState().enqueue(contact())
})

describe('retryFailedGeocodes', () => {
  it('pins the contact once the lookup succeeds', async () => {
    fetchCoordinate.mockResolvedValue(found)
    await retryFailedGeocodes()
    expect(saved()?.coordinate).toEqual(found)
    expect(queue()).toEqual([])
  })

  it('waits while the device is offline', async () => {
    runtime.offline = true
    await retryFailedGeocodes()
    expect(fetchCoordinate).not.toHaveBeenCalled()
    expect(queue()).toHaveLength(1)
  })

  it('backs off after a failure, and stops the run when offline', async () => {
    useContacts.setState({ contacts: [contact(), contact({ id: 'c2' })] })
    useGeocodeRetry.getState().enqueue(contact({ id: 'c2' }))
    fetchCoordinate.mockRejectedValue(failure('offline'))
    await retryFailedGeocodes()
    expect(fetchCoordinate).toHaveBeenCalledTimes(1)
    expect(queue()[0]).toMatchObject({ contactId: 'c1', attempts: 1 })
    expect(queue()[0].notBefore).toBeGreaterThan(Date.now())

    await retryFailedGeocodes()
    expect(fetchCoordinate).toHaveBeenCalledTimes(2)
    expect(queue().map((entry) => entry.attempts)).toEqual([1, 1])
  })

  it('drops a lookup that can never succeed', async () => {
    fetchCoordinate.mockRejectedValue(failure('client'))
    await retryFailedGeocodes()
    expect(queue()).toEqual([])
  })

  it('drops a retry once the address has no match', async () => {
    fetchCoordinate.mockResolvedValue(null)
    await retryFailedGeocodes()
    expect(saved()?.coordinate).toBeUndefined()
    expect(queue()).toEqual([])
  })

  it('drops retries for deleted or re-addressed contacts', async () => {
    useContacts.setState({
      contacts: [contact({ address: { line1: '14 Oak Ave' } })],
    })
    await retryFailedGeocodes()
    useContacts.setState({ contacts: [] })
    useGeocodeRetry.getState().enqueue(contact())
    await retryFailedGeocodes()
    expect(fetchCoordinate).not.toHaveBeenCalled()
    expect(queue()).toEqual([])
  })

  it('keeps a pin placed by hand during the lookup', async () => {
    const dropped = { latitude: 1, longitude: 2 }
    fetchCoordinate.mockImplementation(async () => {
      useContacts.getState().updateContact({
        id: 'c1',
        coordinate: dropped,
        userDraggedCoordinate: true,
      })
      return found
    })
    await retryFailedGeocodes()
    expect(saved()?.coordinate).toEqual(dropped)
  })

  it('keeps a newer retry queued during the lookup', async () => {
    const moved = contact({ address: { line1: '14 Oak Ave' } })
    fetchCoordinate.mockImplementation(async () => {
      useContacts.setState({ contacts: [moved] })
      useGeocodeRetry.getState().enqueue(moved)
      throw failure('offline')
    })
    await retryFailedGeocodes()
    expect(saved()?.coordinate).toBeUndefined()
    expect(queue()).toEqual([
      {
        contactId: 'c1',
        key: geocodeRetryKey(moved),
        attempts: 0,
        notBefore: 0,
      },
    ])
  })

  it('forgets every retry in data protection mode', async () => {
    usePreferences.setState({ dataProtectionMode: true })
    await retryFailedGeocodes()
    expect(fetchCoordinate).not.toHaveBeenCalled()
    expect(queue()).toEqual([])
  })

  it('runs one pass at a time', async () => {
    fetchCoordinate.mockResolvedValue(found)
    await Promise.all([retryFailedGeocodes(), retryFailedGeocodes()])
    expect(fetchCoordinate).toHaveBeenCalledTimes(1)
  })
})
