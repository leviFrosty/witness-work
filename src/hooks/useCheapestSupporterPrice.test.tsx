import React, { useEffect } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  getOfferings: vi.fn(),
  reconnect: new Set<() => void>(),
  foreground: new Set<() => void>(),
  price: undefined as string | null | undefined,
}))

vi.mock('react-native-purchases', () => ({
  default: { getOfferings: runtime.getOfferings },
}))
vi.mock('@/hooks/useCustomer', () => ({ default: () => ({ ready: true }) }))
vi.mock('@/lib/logger', () => ({ logger: { warn: () => {} } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn() },
}))
vi.mock('@/lib/http/online', () => ({
  addReconnectListener: (listener: () => void) => {
    runtime.reconnect.add(listener)
    return { remove: () => runtime.reconnect.delete(listener) }
  },
}))
vi.mock('@/lib/appLifecycle', () => ({
  addForegroundListener: (listener: () => void) => {
    runtime.foreground.add(listener)
    return { remove: () => runtime.foreground.delete(listener) }
  },
}))

import useCheapestSupporterPrice from '@/hooks/useCheapestSupporterPrice'

function Harness() {
  const { priceString } = useCheapestSupporterPrice()
  useEffect(() => {
    runtime.price = priceString
  })
  return null
}

const offerings = {
  all: {
    supporter: {
      monthly: { product: { price: 2, priceString: '$2.00' } },
      annual: {
        product: { price: 18, pricePerMonthString: '$1.50' },
      },
    },
  },
}
const offline = () =>
  Promise.reject(new Error('The Internet connection appears to be offline.'))

let renderer: ReactTestRenderer | null = null
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))
const mount = async () => {
  await act(async () => {
    renderer = create(<Harness />)
  })
  await settle()
}

beforeEach(() => {
  vi.clearAllMocks()
  runtime.reconnect.clear()
  runtime.foreground.clear()
  runtime.price = undefined
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

it.each([
  ['the connection comes back', runtime.reconnect],
  ['the app comes back', runtime.foreground],
])(
  'loads the price again when %s after an offline start',
  async (_, listeners) => {
    runtime.getOfferings.mockImplementationOnce(offline)
    await mount()
    expect(runtime.price).toBeNull()
    expect(listeners.size).toBe(1)

    runtime.getOfferings.mockResolvedValueOnce(offerings)
    await act(async () => listeners.forEach((listener) => listener()))
    await settle()

    expect(runtime.getOfferings).toHaveBeenCalledTimes(2)
    expect(runtime.price).toBe('$1.50')

    expect(listeners.size).toBe(0)
  }
)

it('loads once when the first try works', async () => {
  runtime.getOfferings.mockResolvedValueOnce(offerings)
  await mount()
  expect(runtime.price).toBe('$1.50')
  expect(runtime.reconnect.size).toBe(0)
  expect(runtime.getOfferings).toHaveBeenCalledTimes(1)
})
