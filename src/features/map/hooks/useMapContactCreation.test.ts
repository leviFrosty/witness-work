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
}))
vi.mock('@react-navigation/native', () => ({ useNavigation: () => mocks }))
vi.mock('expo-crypto', () => ({ randomUUID: mocks.uuid }))
vi.mock('@/lib/haptics', () => ({ default: { light: mocks.haptic } }))
vi.mock('@/stores/contactsStore', () => ({
  default: { getState: () => ({ contacts: mocks.contacts }) },
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

    // Save changes the store while the Visit Form / Contact Details are still
    // covering the map. The saved pin may differ from the original selection.
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
})
