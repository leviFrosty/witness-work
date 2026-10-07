import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  status: 'granted' as string | null,
  requestLocation: vi.fn(),
  openSettings: vi.fn(),
  searchPlaces: vi.fn(async () => []),
  slot: (name: string) => (props: React.PropsWithChildren) =>
    React.createElement(name, props),
}))

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Linking: { openSettings: mocks.openSettings },
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
}))
vi.mock('expo-location', () => ({
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
}))
vi.mock('lucide-react-native', () => ({ LocateFixed: 'LocateFixed' }))
vi.mock('@/hooks/useLocation', () => ({
  default: () => ({
    location: null,
    status: mocks.status,
    requestLocation: mocks.requestLocation,
    refreshStatus: vi.fn(),
  }),
}))
vi.mock('@/lib/placeSearch', () => ({
  searchPlaces: mocks.searchPlaces,
  resolvePlace: vi.fn(),
}))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn() },
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: {},
    fonts: {},
    numbers: {},
    fontSize: () => 14,
  }),
}))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/Empty', () => ({ default: 'Empty' }))
vi.mock('@/components/ui/TextInput', () => ({ default: 'TextInput' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/components/ui/InfoPopover', () => ({ default: 'InfoPopover' }))
vi.mock('@/components/ui/PointerHover', () => ({
  default: mocks.slot('PointerHover'),
  HoverTint: 'HoverTint',
}))
vi.mock('@/components/ui/PointerTooltip', () => ({
  default: mocks.slot('PointerTooltip'),
}))

import PlaceSearchInput from '@/components/PlaceSearchInput'

let root: ReactTestRenderer

const render = async (query = '') => {
  await act(async () => {
    root = create(
      <PlaceSearchInput
        scope='address'
        query={query}
        onChangeQuery={() => {}}
        onSelect={() => {}}
        placeholder='enterAddress'
        accessibilityLabel='enterAddress'
      />
    )
  })
}

const locationButton = () =>
  root.root
    .findAllByType('TouchableOpacity' as never)
    .find((node) =>
      ['enableLocationForNearbyResults', 'locationOff_openSettings'].includes(
        node.props.accessibilityLabel
      )
    )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.status = 'granted'
})

afterEach(async () => {
  await act(async () => root.unmount())
})

describe('PlaceSearchInput location status', () => {
  it('explains that nearby results come first once location is shared', async () => {
    await render()
    expect(root.root.findByType('InfoPopover' as never).props.description).toBe(
      'usingYourLocation'
    )
    expect(locationButton()).toBeUndefined()
  })

  it('asks for location only when the button is tapped', async () => {
    mocks.status = 'undetermined'
    await render('1 Example Way')
    expect(mocks.requestLocation).not.toHaveBeenCalled()

    await act(async () => locationButton()!.props.onPress())
    expect(mocks.requestLocation).toHaveBeenCalledOnce()
  })

  it('opens Settings once location was declined', async () => {
    mocks.status = 'denied'
    await render()
    const button = locationButton()!
    expect(button.props.accessibilityLabel).toBe('locationOff_openSettings')

    await act(async () => button.props.onPress())
    expect(mocks.openSettings).toHaveBeenCalledOnce()
    expect(mocks.requestLocation).not.toHaveBeenCalled()
  })
})
