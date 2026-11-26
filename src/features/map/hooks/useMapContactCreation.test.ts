import { createElement, useEffect } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useMapContactCreation from '@/features/map/hooks/useMapContactCreation'
import { Contact } from '@/types/contact'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  addListener: vi.fn(),
  uuid: vi.fn(() => 'new-contact'),
  haptic: vi.fn(),
  onContactCreated: vi.fn(),
  contacts: [] as Contact[],
  autoLookupPinAddress: true,
  dataProtectionMode: false,
  setPreferences: vi.fn(),
  reverseGeocode: vi.fn<() => Promise<unknown>>(async () => null),
}))
vi.mock('@react-navigation/native', () => ({ useNavigation: () => mocks }))
vi.mock('expo-crypto', () => ({ randomUUID: mocks.uuid }))
vi.mock('@/lib/haptics', () => ({ default: { light: mocks.haptic } }))
vi.mock('@/stores/contactsStore', () => ({
  default: { getState: () => ({ contacts: mocks.contacts }) },
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (
    selector: (s: {
      autoLookupPinAddress: boolean
      dataProtectionMode: boolean
      set: (patch: { autoLookupPinAddress?: boolean }) => void
    }) => unknown
  ) =>
    selector({
      autoLookupPinAddress: mocks.autoLookupPinAddress,
      dataProtectionMode: mocks.dataProtectionMode,
      set: (patch) => {
        mocks.setPreferences(patch)
        if (typeof patch.autoLookupPinAddress === 'boolean') {
          mocks.autoLookupPinAddress = patch.autoLookupPinAddress
        }
      },
    }),
}))
vi.mock('@/lib/reverseGeocode', () => ({
  reverseGeocodeCoordinate: mocks.reverseGeocode,
}))

let state: ReturnType<typeof useMapContactCreation>
let root: ReturnType<typeof create>
let blur: () => void
let focus: () => void
const unsubscribe = vi.fn()

function Consumer() {
  const value = useMapContactCreation(mocks.onContactCreated)
  useEffect(() => {
    state = value
  })
  return null
}

beforeEach(async () => {
  vi.clearAllMocks()
  mocks.contacts = []
  mocks.autoLookupPinAddress = true
  mocks.dataProtectionMode = false
  mocks.reverseGeocode.mockResolvedValue(null)
  mocks.uuid.mockReturnValue('new-contact')
  mocks.addListener.mockImplementation((event, listener) => {
    if (event === 'blur') blur = listener
    else if (event === 'focus') focus = listener
    else throw new Error(`Unexpected navigation event: ${event}`)
    return unsubscribe
  })
  await act(async () => {
    root = create(createElement(Consumer))
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
})

describe('creating a contact from the map', () => {
  it('replaces the temporary pin and waits for confirmation before navigating', async () => {
    await act(async () => state.dropPin({ latitude: 40, longitude: -73 }))
    const latestPoint = { latitude: 0, longitude: -73.123456789 }
    await act(async () => state.dropPin(latestPoint))
    expect(state.coordinate).toEqual(latestPoint)
    expect(mocks.haptic).toHaveBeenCalledTimes(2)
    expect(mocks.uuid).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()

    await act(async () => state.createContact())
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith('Contact Form', {
      id: 'new-contact',
      initialCoordinate: latestPoint,
    })
    expect(state.coordinate).toBeUndefined()
    await act(async () => state.createContact())
    expect(mocks.navigate).toHaveBeenCalledTimes(1)
  })

  it('discards the selection without creating a contact when cancelled', async () => {
    await act(async () => state.dropPin({ latitude: 45, longitude: 0 }))
    await act(async () => state.cancel())
    expect(state.coordinate).toBeUndefined()
    await act(async () => state.createContact())
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(mocks.uuid).not.toHaveBeenCalled()
  })

  it('clears the pin when leaving the map and removes its listener on unmount', async () => {
    await act(async () => state.dropPin({ latitude: 0, longitude: 0 }))
    await act(async () => blur())
    expect(state.coordinate).toBeUndefined()
    expect(mocks.navigate).not.toHaveBeenCalled()
    await act(async () => root.unmount())
    expect(unsubscribe).toHaveBeenCalledTimes(2)
  })

  it('selects the saved contact once when the map regains focus after the forms and details', async () => {
    await act(async () => state.dropPin({ latitude: 40, longitude: -73 }))
    await act(async () => state.createContact())
    await act(async () => blur())

    const savedCoordinate = { latitude: 0, longitude: -73.123456789 }
    mocks.contacts = [
      {
        id: 'new-contact',
        name: 'New contact',
        createdAt: new Date(),
        coordinate: savedCoordinate,
      },
    ]
    expect(mocks.onContactCreated).not.toHaveBeenCalled()
    await act(async () => focus())
    expect(mocks.onContactCreated).toHaveBeenCalledExactlyOnceWith(
      'new-contact',
      savedCoordinate
    )

    await act(async () => blur())
    await act(async () => focus())
    expect(mocks.onContactCreated).toHaveBeenCalledTimes(1)
  })

  it('keeps the old selection when creation is abandoned and does not focus unrelated additions', async () => {
    await act(async () => state.dropPin({ latitude: 45, longitude: 0 }))
    await act(async () => state.createContact())
    await act(async () => blur())
    mocks.contacts = [
      {
        id: 'another-contact',
        name: 'Another contact',
        createdAt: new Date(),
        coordinate: { latitude: 45, longitude: 0 },
      },
    ]
    await act(async () => focus())
    expect(mocks.onContactCreated).not.toHaveBeenCalled()

    mocks.contacts = [{ ...mocks.contacts[0], id: 'new-contact' }]
    await act(async () => focus())
    expect(mocks.onContactCreated).not.toHaveBeenCalled()
  })

  it.each(['deleted', 'dismissed', 'pin removed'])(
    'does not select a contact that was %s before returning to the map',
    async (change) => {
      await act(async () => state.dropPin({ latitude: 45, longitude: 0 }))
      await act(async () => state.createContact())
      await act(async () => blur())
      mocks.contacts =
        change === 'deleted'
          ? []
          : [
              {
                id: 'new-contact',
                name: 'New contact',
                createdAt: new Date(),
                coordinate:
                  change === 'pin removed'
                    ? undefined
                    : { latitude: 45, longitude: 0 },
                dismissedUntil:
                  change === 'dismissed'
                    ? new Date(Date.now() + 86_400_000)
                    : undefined,
              },
            ]
      await act(async () => focus())
      expect(mocks.onContactCreated).not.toHaveBeenCalled()
    }
  )

  it('tracks a subsequent creation after an abandoned form', async () => {
    mocks.uuid.mockReturnValueOnce('abandoned').mockReturnValueOnce('saved')
    await act(async () => state.dropPin({ latitude: 45, longitude: 0 }))
    await act(async () => state.createContact())
    await act(async () => blur())
    await act(async () => focus())
    await act(async () => state.dropPin({ latitude: 0, longitude: 0 }))
    await act(async () => state.createContact())
    await act(async () => blur())
    mocks.contacts = [
      {
        id: 'saved',
        name: 'Saved contact',
        createdAt: new Date(),
        coordinate: { latitude: 0, longitude: 0 },
      },
    ]
    await act(async () => focus())
    expect(mocks.onContactCreated).toHaveBeenCalledExactlyOnceWith('saved', {
      latitude: 0,
      longitude: 0,
    })
  })

  it('reverse geocodes a dropped pin and passes initialAddress when creating a contact', async () => {
    const resolved = {
      address: {
        line1: '12 Rue de la Paix',
        city: 'Paris',
        zip: '75002',
        country: 'France',
      },
      formattedAddress: '12 Rue de la Paix, 75002 Paris, France',
    }
    mocks.reverseGeocode.mockResolvedValueOnce(resolved)
    const point = { latitude: 48.86914, longitude: 2.33118 }
    await act(async () => state.dropPin(point))
    expect(state.addressLookup.status).toBe('resolved')
    expect(state.addressLookup.result).toEqual(resolved)

    await act(async () => state.createContact())
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith('Contact Form', {
      id: 'new-contact',
      initialCoordinate: point,
      initialAddress: resolved.address,
    })
  })

  it('skips reverse geocoding and persists opt-out when disabled on the fly', async () => {
    const point = { latitude: -23.553, longitude: -46.652 }
    await act(async () => state.addressLookup.setEnabled(false))
    expect(mocks.setPreferences).toHaveBeenCalledExactlyOnceWith({
      autoLookupPinAddress: false,
    })
    await act(async () => root.update(createElement(Consumer)))
    await act(async () => state.dropPin(point))
    expect(mocks.reverseGeocode).not.toHaveBeenCalled()
    expect(state.addressLookup.enabled).toBe(false)

    await act(async () => state.createContact())
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith('Contact Form', {
      id: 'new-contact',
      initialCoordinate: point,
    })
  })

  it('disables reverse geocoding and hides toggle in data protection mode', async () => {
    mocks.dataProtectionMode = true
    await act(async () => root.update(createElement(Consumer)))
    await act(async () =>
      state.dropPin({ latitude: 48.86914, longitude: 2.33118 })
    )
    expect(mocks.reverseGeocode).not.toHaveBeenCalled()
    expect(state.addressLookup.enabled).toBe(false)
    expect(state.addressLookup.canToggle).toBe(false)
  })
})
