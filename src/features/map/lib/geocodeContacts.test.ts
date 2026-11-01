import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact, Coordinate } from '@/types/contact'

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/lib/address', () => ({ fetchCoordinateFromAddress: vi.fn() }))
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

import { fetchCoordinateFromAddress } from '@/lib/address'
import useContacts from '@/stores/contactsStore'
import {
  contactsToFind,
  countBucket,
  geocodeContacts,
  pinLookupKey,
  type GeocodeOutcome,
} from '@/features/map/lib/geocodeContacts'
import {
  skipPinLookups,
  useMapFindSkips,
} from '@/features/map/stores/mapFindSkips'

const fetchCoordinate = vi.mocked(fetchCoordinateFromAddress)
const pin: Coordinate = { latitude: 39.78, longitude: -89.65 }
const failure = (kind: string) => Object.assign(new Error(kind), { kind })

const contact = (id: string, overrides: Partial<Contact> = {}): Contact => ({
  id,
  name: `Sam ${id}`,
  createdAt: new Date('2026-01-01'),
  address: { line1: `${id} Maple St`, city: 'Springfield' },
  ...overrides,
})

const saved = (id: string) =>
  useContacts.getState().contacts.find((c) => c.id === id)

const run = async (contacts: Contact[]) => {
  const outcomes: Record<string, GeocodeOutcome> = {}
  const controller = new AbortController()
  const result = await geocodeContacts(contacts, {
    controller,
    incrementGeocodeApiCallCount: () => {},
    onResult: (c, outcome) => {
      outcomes[c.id] = outcome
    },
  })
  return { ...result, outcomes, controller }
}

beforeEach(() => {
  fetchCoordinate.mockReset()
  useContacts.setState({ contacts: [] })
  useMapFindSkips.setState({ skipped: [] })
})

describe('contactsToFind', () => {
  it('keeps active contacts with an address and no pin', () => {
    const contacts = [
      contact('a'),
      contact('pinned', { coordinate: pin }),
      contact('dragged', { userDraggedCoordinate: true }),
      contact('blank', { address: { line1: ' ', city: '' } }),
      contact('none', { address: undefined }),
      contact('dismissed', { dismissedUntil: new Date(Date.now() + 86400000) }),
      contact('lapsed', { dismissedUntil: new Date(Date.now() - 86400000) }),
    ]
    expect(contactsToFind(contacts, new Set()).map((c) => c.id)).toEqual([
      'a',
      'lapsed',
    ])
  })

  it('leaves out skipped addresses until the address changes', () => {
    const a = contact('a')
    const skipped = new Set([pinLookupKey(a)])
    expect(contactsToFind([a], skipped)).toEqual([])
    const edited = {
      ...a,
      address: { line1: '9 Oak Ave', city: 'Springfield' },
    }
    expect(contactsToFind([edited], skipped)).toEqual([edited])
  })
})

describe('geocodeContacts', () => {
  it('pins found contacts and reports the rest', async () => {
    const contacts = [contact('found'), contact('missing'), contact('down')]
    useContacts.setState({ contacts })
    fetchCoordinate.mockImplementation(async (_count, address) => {
      if (address?.line1?.startsWith('found')) return pin
      if (address?.line1?.startsWith('missing')) return null
      throw failure('server')
    })

    const { outcomes, wentOffline } = await run(contacts)

    expect(wentOffline).toBe(false)
    expect(outcomes).toEqual({
      found: 'found',
      missing: 'notFound',
      down: 'failed',
    })
    expect(saved('found')?.coordinate).toEqual(pin)
    expect(saved('missing')?.coordinate).toBeUndefined()
  })

  it('never replaces a pin placed while the lookup ran', async () => {
    const a = contact('a')
    useContacts.setState({ contacts: [a] })
    const handPlaced = { latitude: 1, longitude: 2 }
    fetchCoordinate.mockImplementation(async () => {
      useContacts.getState().updateContact({
        id: 'a',
        coordinate: handPlaced,
        userDraggedCoordinate: true,
      })
      return pin
    })

    const { outcomes } = await run([a])

    expect(outcomes).toEqual({ a: 'changed' })
    expect(saved('a')?.coordinate).toEqual(handPlaced)
  })

  it('stops the whole batch when the device goes offline', async () => {
    const contacts = Array.from({ length: 8 }, (_, i) => contact(`c${i}`))
    useContacts.setState({ contacts })
    fetchCoordinate.mockRejectedValue(failure('offline'))

    const { outcomes, wentOffline, controller } = await run(contacts)

    expect(wentOffline).toBe(true)
    expect(controller.signal.aborted).toBe(true)
    expect(outcomes).toEqual({})

    expect(fetchCoordinate.mock.calls.length).toBeLessThanOrEqual(3)
  })

  it('looks up no more than three at once', async () => {
    const contacts = Array.from({ length: 7 }, (_, i) => contact(`c${i}`))
    useContacts.setState({ contacts })
    let inFlight = 0
    let peak = 0
    fetchCoordinate.mockImplementation(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 1))
      inFlight -= 1
      return pin
    })

    const { outcomes } = await run(contacts)

    expect(peak).toBe(3)
    expect(Object.values(outcomes)).toEqual(Array(7).fill('found'))
  })

  it('stops picking up contacts once cancelled', async () => {
    const contacts = Array.from({ length: 6 }, (_, i) => contact(`c${i}`))
    useContacts.setState({ contacts })
    const controller = new AbortController()
    fetchCoordinate.mockImplementation(async () => {
      controller.abort()
      return pin
    })
    const outcomes: string[] = []

    const { wentOffline } = await geocodeContacts(contacts, {
      controller,
      incrementGeocodeApiCallCount: () => {},
      onResult: (c) => outcomes.push(c.id),
    })

    expect(wentOffline).toBe(false)
    expect(outcomes).toEqual([])
    expect(useContacts.getState().contacts.some((c) => c.coordinate)).toBe(
      false
    )
  })
})

describe('skipPinLookups', () => {
  it('adds keys and forgets contacts that no longer need finding', () => {
    const a = contact('a')
    const b = contact('b')
    useContacts.setState({ contacts: [a, b] })
    skipPinLookups([pinLookupKey(a)])
    useContacts.getState().updateContact({ id: 'a', coordinate: pin })

    skipPinLookups([pinLookupKey(b)])

    expect(useMapFindSkips.getState().skipped).toEqual([pinLookupKey(b)])
  })
})

describe('countBucket', () => {
  it('groups counts', () => {
    expect([0, 1, 2, 5, 6, 20, 21, 50, 51, 400].map(countBucket)).toEqual([
      '0',
      '1',
      '2-5',
      '2-5',
      '6-20',
      '6-20',
      '21-50',
      '21-50',
      '51+',
      '51+',
    ])
  })
})
