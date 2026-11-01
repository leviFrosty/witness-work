import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  status: 'granted' as string | null,
  requestLocation: vi.fn(),
  openSettings: vi.fn(),
  searchPlaces: vi.fn(async (): Promise<unknown[]> => []),
  resolvePlace: vi.fn(),
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
  resolvePlace: mocks.resolvePlace,
  isUnexpectedPlaceSearchError: () => false,
  placeSearchFailure: () => 'failed',
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

const render = async (
  query = '',
  {
    onChangeQuery = () => {},
    onSelect = () => {},
  }: {
    onChangeQuery?: (query: string) => void
    onSelect?: (place: unknown) => void
  } = {}
) => {
  await act(async () => {
    root = create(
      <PlaceSearchInput
        scope='address'
        query={query}
        onChangeQuery={onChangeQuery}
        onSelect={onSelect}
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

const SUGGESTION = {
  id: 'apple-park',
  title: '1 Apple Park Way',
  subtitle: 'Cupertino, CA, United States',
}
const SUGGESTION_LABEL = '1 Apple Park Way, Cupertino, CA, United States'

const field = () => root.root.findByType('TextInput' as never)
const suggestionRows = () =>
  root.root
    .findAllByType('TouchableOpacity' as never)
    .filter((node) => node.props.accessibilityLabel === SUGGESTION_LABEL)

const renderWithSuggestion = async (
  handlers: Parameters<typeof render>[1] = {}
) => {
  mocks.searchPlaces.mockResolvedValue([SUGGESTION])
  await render('1 Apple Park', handlers)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300))
  })
  expect(suggestionRows()).toHaveLength(1)
}

describe('PlaceSearchInput picking a suggestion', () => {
  it('shows the pick at once, before the place finishes loading', async () => {
    const onSelect = vi.fn()
    let finish: (place: unknown) => void = () => {}
    mocks.resolvePlace.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    await renderWithSuggestion({ onSelect })

    await act(async () => {
      suggestionRows()[0].props.onPress()
    })
    expect(field().props.value).toBe(SUGGESTION_LABEL)
    expect(suggestionRows()).toHaveLength(0)
    expect(onSelect).not.toHaveBeenCalled()

    const place = { address: '1 Apple Park Way, Cupertino CA 95014' }
    await act(async () => finish(place))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(place)
  })

  it('brings the suggestions back when the place fails to load', async () => {
    const onSelect = vi.fn()
    mocks.resolvePlace.mockRejectedValue(new Error('lookup failed'))
    await renderWithSuggestion({ onSelect })

    await act(async () => {
      suggestionRows()[0].props.onPress()
    })
    expect(onSelect).not.toHaveBeenCalled()
    expect(field().props.value).toBe('1 Apple Park')
    expect(suggestionRows()).toHaveLength(1)
  })

  it('drops a pick that is still loading once the publisher types again', async () => {
    const onSelect = vi.fn()
    const onChangeQuery = vi.fn()
    let finish: (place: unknown) => void = () => {}
    mocks.resolvePlace.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    await renderWithSuggestion({ onSelect, onChangeQuery })

    await act(async () => {
      suggestionRows()[0].props.onPress()
    })
    await act(async () => field().props.onChangeText('1 Apple Park W'))
    expect(onChangeQuery).toHaveBeenCalledWith('1 Apple Park W')

    await act(async () => finish({ address: 'late' }))
    expect(onSelect).not.toHaveBeenCalled()
  })
})
