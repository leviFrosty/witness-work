import React from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Contact } from '@/types/contact'

vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('lucide-react-native', () => ({ X: 'X' }))
vi.mock('react-native-maps', () => ({ default: 'MapView', Marker: 'Marker' }))
vi.mock('tamagui', () => ({
  Spinner: 'Spinner',
  Sheet: Object.assign(
    ({ open, children }: React.PropsWithChildren<{ open: boolean }>) =>
      open ? React.createElement('Sheet', null, children) : null,
    { Overlay: 'SheetOverlay', Frame: 'SheetFrame' }
  ),
}))
vi.mock('@tamagui/toast', () => ({
  useToastController: () => ({ show: vi.fn() }),
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}))
vi.mock('expo-location', () => ({
  getForegroundPermissionsAsync: async () => ({ granted: false }),
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, fonts: {}, numbers: {}, fontSize: () => 16 }),
}))
vi.mock('@/stores/contactsStore', () => ({ default: () => ({ contacts: [] }) }))
vi.mock('@/stores/preferences', () => ({ usePreferences: () => ({}) }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/components/ui/Card', () => ({ default: 'Card' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/IconButton', () => ({ default: 'IconButton' }))
vi.mock('@/components/ui/InfoPopover', () => ({ default: 'InfoPopover' }))
vi.mock('@/components/ui/layout/XView', () => ({ default: 'XView' }))
vi.mock(
  '@/features/contacts/components/MapWarningLocationSharingDisabled',
  () => ({
    default: 'MapWarningLocationSharingDisabled',
  })
)

import PinLocation from '@/features/contacts/components/PinLocation'
import Button from '@/components/ui/Button'
import { Marker } from 'react-native-maps'

let root: ReturnType<typeof create>

afterEach(async () => {
  await act(async () => root.unmount())
})

describe('manual pin without location permission', () => {
  it.each([
    { latitude: 0, longitude: -73.123456789 },
    { latitude: 40.123456789, longitude: 0 },
    { latitude: 0, longitude: 0 },
  ])('renders and clears a prefilled point %j', async (coordinate) => {
    const contact: Contact = {
      id: 'new',
      name: '',
      createdAt: new Date(),
      coordinate,
      userDraggedCoordinate: true,
    }
    const setContact = vi.fn()
    await act(async () => {
      root = create(<PinLocation contact={contact} setContact={setContact} />)
    })
    const press = (label: string) =>
      act(async () => {
        root.root
          .findAllByType(Button)
          .find((button) => button.props.children.props.children === label)!
          .props.onPress()
      })
    await press('edit')
    expect(root.root.findByType(Marker).props.coordinate).toEqual(coordinate)

    await press('clear')
    expect(setContact).toHaveBeenCalledExactlyOnceWith({
      ...contact,
      coordinate: undefined,
      userDraggedCoordinate: undefined,
    })
    expect(root.root.findAllByType(Marker)).toHaveLength(0)
  })
})
