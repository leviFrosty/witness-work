import React, { type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  const i18n = new I18n({ en }, { locale: 'en' })
  return { default: i18n, _i18n: i18n }
})
const share = vi.hoisted(() =>
  vi.fn(async (_content: { message: string }) => ({ action: 'sharedAction' }))
)
vi.mock('react-native', async () => {
  const ReactModule = await import('react')
  const passThrough =
    (name: string) =>
    ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement(name, null, children)
  return {
    View: passThrough('View'),
    ScrollView: passThrough('ScrollView'),
    Share: { share },
    Alert: { alert: vi.fn() },
    I18nManager: { isRTL: false },
    Platform: { OS: 'ios', select: (o: { ios?: unknown }) => o.ios },
  }
})
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: vi.fn() }),
}))
vi.mock('lucide-react-native', () => ({
  Pencil: 'Pencil',
  Share: 'Share',
  Trash2: 'Trash2',
}))
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn(async () => true) }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ fonts: {}, colors: {}, fontSize: () => 14 }),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/haptics', () => ({
  default: { success: vi.fn(async () => {}), light: vi.fn(async () => {}) },
}))
vi.mock('@/stores/toasts', () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn(), news: vi.fn() },
}))
vi.mock('@/stores/preferences', async () => {
  const { create: createStore } = await import('zustand')
  return {
    usePreferences: createStore(() => ({
      distanceUnit: 'mi',
      fuelEconomyUnit: 'mpgUS',
    })),
  }
})

/** Leaf components as host elements, so their props can be read. */
const host = vi.hoisted(() => (name: string) => async () => {
  const ReactModule = await import('react')
  return {
    default: (props: { children?: ReactNode }) =>
      ReactModule.createElement(name, props, props.children),
  }
})
vi.mock('@/components/ui/layout/Header', host('Header'))
vi.mock('@/components/ui/inputs/Section', host('Section'))
vi.mock('@/components/ui/inputs/InputRowContainer', host('InputRowContainer'))
vi.mock('@/components/ui/IconButton', host('IconButton'))
vi.mock('@/components/ui/MyText', host('Text'))
vi.mock('@/components/RichNote', host('RichNote'))

import useMileage from '@/stores/mileage'
import useSharedCars from '@/stores/sharedCars'
import {
  MileageSharingContext,
  NO_MILEAGE_SHARING,
} from '@/features/mileage/hooks/useMileageSharing'
import MileageTripDetailsScreen from '@/features/mileage/screens/MileageTripDetailsScreen'
import { peopleFixture } from '@/lib/mileage/testing/peopleFixture'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

type Found = { props: Record<string, unknown> }

let renderer: ReactTestRenderer | undefined
const navigation = { goBack: vi.fn(), canGoBack: () => true }

function render(tripId: string) {
  const { buddies } = peopleFixture()
  const props = {
    route: { key: 'details', name: 'MileageTripDetails', params: { tripId } },
    navigation,
  } as unknown as React.ComponentProps<typeof MileageTripDetailsScreen>
  act(() => {
    renderer = create(
      <MileageSharingContext.Provider
        value={{
          ...NO_MILEAGE_SHARING,
          enabled: true,
          buddies,
          ownName: 'Levi W.',
        }}
      >
        <MileageTripDetailsScreen {...props} />
      </MileageSharingContext.Provider>
    )
  })
  return renderer!
}

/** The detail rows as label → value. */
function details(tree: ReactTestRenderer): Record<string, string> {
  const rows = tree.root.findAll(
    (node) => node.type === ('InputRowContainer' as never)
  ) as Found[]
  return Object.fromEntries(
    rows.flatMap((row) => {
      const value = (row as unknown as ReactTestRenderer['root']).findAll(
        (node) => node.type === ('Text' as never)
      )[0]?.props.children
      return typeof value === 'string' ? [[row.props.label, value]] : []
    })
  )
}

beforeEach(() => {
  const fixture = peopleFixture()
  useMileage.getState()._WARNING_forceDeleteMileage()
  useMileage.setState({
    vehicles: [fixture.vehicles[0]],
    trips: [fixture.trips.mine],
  })
  useSharedCars.setState(useSharedCars.getInitialState(), true)
  useSharedCars.setState({ cars: fixture.cars })
  share.mockClear()
  navigation.goBack.mockClear()
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

describe('Trip Details on a Shared Car', () => {
  it('says who logged a trip, and who changed it when that’s someone else', () => {
    // Ana logged it; the User changed it since.
    const rows = details(render('van-ana'))
    expect(rows['Car']).toBe('Family Minivan')
    expect(rows['Logged By']).toBe('Annie')
    expect(rows['Edited By']).toBe('You')
  })

  it('leaves out Edited By when the one who logged it changed it', () => {
    const rows = details(render('van-ben'))
    expect(rows['Logged By']).toBe('Ben')
    expect(rows).not.toHaveProperty('Edited By')
  })

  it('names the User as You, and someone who left by their name', () => {
    expect(details(render('van-mine'))['Logged By']).toBe('You')
    act(() => renderer?.unmount())
    expect(details(render('van-cal'))['Logged By']).toBe('Cal')
  })

  it('says neither on the User’s own car', () => {
    const rows = details(render('mine'))
    expect(rows['Car']).toBe('Civic')
    expect(rows).not.toHaveProperty('Logged By')
    expect(rows).not.toHaveProperty('Edited By')
  })

  it('shares text that says who logged the trip', async () => {
    const tree = render('van-ana')
    // The header's buttons, as it's handed them.
    const header = tree.root.find((node) => node.type === ('Header' as never))
    const buttons = React.Children.toArray(
      (header.props.rightElement as React.ReactElement<{ children: ReactNode }>)
        .props.children
    ) as unknown as Found[]
    const shareButton = buttons.find(
      (button) => button.props.accessibilityLabel === 'Share'
    )!
    await act(async () => (shareButton.props.onPress as () => void)())
    expect(share).toHaveBeenCalledOnce()
    expect(share.mock.calls[0][0].message.split('\n')).toEqual([
      'Mar 2 · Family Minivan',
      'Distance: 30 mi',
      'Logged by: Annie',
    ])
  })

  it('closes when its trip goes with its car', () => {
    render('van-ana')
    act(() => {
      const { ['van-space']: _van, ...rest } = useSharedCars.getState().cars
      useSharedCars.setState({ cars: rest })
    })
    expect(navigation.goBack).toHaveBeenCalledOnce()
  })
})
