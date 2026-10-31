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
vi.mock('react-native', async () => {
  const ReactModule = await import('react')
  return {
    View: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('View', null, children),
    Share: { share: vi.fn(async () => ({ action: 'sharedAction' })) },
    Alert: { alert: vi.fn() },
    Platform: { OS: 'ios', select: (o: { ios?: unknown }) => o.ios },
  }
})
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: vi.fn() }),
}))
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn(async () => true) }))
let uuid = 0
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++uuid}` }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    fonts: {},
    colors: { error: 'red', textAlt: 'gray', warnText: 'amber' },
    fontSize: () => 14,
  }),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/haptics', () => ({
  default: { success: vi.fn(async () => {}), light: vi.fn(async () => {}) },
}))
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  news: vi.fn(),
}))
vi.mock('@/stores/toasts', () => ({ toast }))
vi.mock('@/stores/preferences', async () => {
  const { create: createStore } = await import('zustand')
  const store = createStore<{
    distanceUnit: 'mi'
    fuelEconomyUnit: 'mpgUS'
    mileageEntryMode: 'distance' | 'odometer'
    set: (partial: object) => void
  }>((set) => ({
    distanceUnit: 'mi',
    fuelEconomyUnit: 'mpgUS',
    mileageEntryMode: 'distance',
    set: (partial) => set(partial),
  }))
  return { usePreferences: store }
})
// Confirms every destructive alert, as tapping its red button would.
const confirm = vi.hoisted(() =>
  vi.fn((options: { onConfirm: () => void }) => options.onConfirm())
)
vi.mock('@/lib/confirmDestructive', () => ({ default: confirm }))

/** Leaf components as host elements, so their props can be read. */
const host = vi.hoisted(() => (name: string) => async () => {
  const ReactModule = await import('react')
  return {
    default: (props: { children?: ReactNode }) =>
      ReactModule.createElement(name, props, props.children),
  }
})
vi.mock('@/components/ui/layout/Wrapper', host('Wrapper'))
vi.mock(
  '@/components/ui/layout/KeyboardAwareScrollView',
  host('KeyboardAwareScrollView')
)
vi.mock('@/components/ui/layout/ContentColumn', host('ContentColumn'))
vi.mock('@/components/ui/inputs/Section', host('Section'))
vi.mock('@/components/ui/inputs/InputRowContainer', host('InputRowContainer'))
vi.mock('@/components/ui/inputs/InputRowSwitch', host('InputRowSwitch'))
vi.mock('@/components/ui/inputs/InputRowSelect', host('InputRowSelect'))
vi.mock('@/components/ui/inputs/TextInputRow', host('TextInputRow'))
vi.mock('@/components/ui/inputs/NoteInputRow', host('NoteInputRow'))
vi.mock('@/components/ui/DateTimePicker', host('DateTimePicker'))
vi.mock('@/components/ui/SegmentedControl', host('SegmentedControl'))
vi.mock('@/components/ui/ActionButton', host('ActionButton'))
vi.mock('@/components/ui/Button', host('Button'))
vi.mock('@/components/ui/MyText', host('Text'))

import useMileage from '@/stores/mileage'
import { usePreferences } from '@/stores/preferences'
import useSharedCars from '@/stores/sharedCars'
import {
  MileageSharingContext,
  NO_MILEAGE_SHARING,
} from '@/features/mileage/hooks/useMileageSharing'
import MileageTripFormScreen from '@/features/mileage/screens/MileageTripFormScreen'
import { peopleFixture } from '@/lib/mileage/testing/peopleFixture'
import type { RootStackParamList } from '@/types/rootStack'
import type { Trip, Vehicle } from '@/types/mileage'

type Params = RootStackParamList['MileageTripForm']
type Found = { props: Record<string, unknown> }

const civic: Vehicle = { id: 'civic', name: 'Civic', createdAt: 1 }

let renderer: ReactTestRenderer | undefined
const navigation = { goBack: vi.fn(), canGoBack: () => true }

function render(params?: Params) {
  const { buddies } = peopleFixture()
  const props = {
    route: { key: 'form', name: 'MileageTripForm', params },
    navigation,
  } as unknown as React.ComponentProps<typeof MileageTripFormScreen>
  act(() => {
    renderer = create(
      <MileageSharingContext.Provider
        value={{ ...NO_MILEAGE_SHARING, enabled: true, buddies }}
      >
        <MileageTripFormScreen {...props} />
      </MileageSharingContext.Provider>
    )
  })
  return renderer!
}

const all = (tree: ReactTestRenderer, type: string) =>
  tree.root.findAll((node) => node.type === (type as never)) as Found[]
const one = (tree: ReactTestRenderer, type: string) => all(tree, type)[0]
const textRow = (tree: ReactTestRenderer, label: string) =>
  all(tree, 'TextInputRow').find((row) => row.props.label === label)!
const type = (tree: ReactTestRenderer, label: string, text: string) =>
  act(() =>
    (
      textRow(tree, label).props.textInputProps as {
        onChangeText: (text: string) => void
      }
    ).onChangeText(text)
  )
const carPicker = (tree: ReactTestRenderer) =>
  one(tree, 'InputRowSelect') as
    | {
        props: {
          invalid?: boolean
          selectProps: {
            data: { label: string; value: string; systemImage?: string }[]
            value?: string
            onChange: (item: { value: string }) => void
          }
        }
      }
    | undefined
const chooseCar = (tree: ReactTestRenderer, vehicleId: string) =>
  act(() => carPicker(tree)!.props.selectProps.onChange({ value: vehicleId }))
const useOdometer = (tree: ReactTestRenderer) =>
  act(() =>
    (one(tree, 'SegmentedControl').props.onChange as (mode: string) => void)(
      'odometer'
    )
  )
const noteRow = (tree: ReactTestRenderer) =>
  one(tree, 'NoteInputRow') as {
    props: {
      allowImages?: boolean
      description?: string
      onChange: (note: { note?: string; noteDoc?: undefined }) => void
    }
  }
const save = (tree: ReactTestRenderer) =>
  act(() =>
    (
      all(tree, 'ActionButton').find(
        (button) => button.props.children === 'Save'
      )!.props.onPress as () => void
    )()
  )
/** Host elements only: each mocked leaf also shows as its component. */
const byTestId = (tree: ReactTestRenderer, testID: string) =>
  tree.root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID
  )
const textOf = (node: Found) => node.props.children as string

/** Every trip in both stores, by id. */
const allTrips = () => [
  ...useMileage.getState().trips,
  ...Object.values(useSharedCars.getState().cars).flatMap((car) => car.trips),
]

function seed(trips: Trip[] = []) {
  const fixture = peopleFixture()
  useMileage.getState()._WARNING_forceDeleteMileage()
  useMileage.setState({
    vehicles: [civic],
    trips: [fixture.trips.mine, ...trips],
  })
  useSharedCars.setState(useSharedCars.getInitialState(), true)
  useSharedCars.setState({ cars: fixture.cars })
  return fixture
}

const odometerTrip = (
  id: string,
  vehicleId: string,
  start: number,
  end: number
): Trip => ({
  id,
  vehicleId,
  date: '2026-03-02',
  distanceMiles: end - start,
  odometerStartMiles: start,
  odometerEndMiles: end,
  createdAt: 2,
})

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

beforeEach(() => {
  uuid = 0
  seed()
  // A save remembers the entry mode it used.
  usePreferences.setState({ mileageEntryMode: 'distance' })
  navigation.goBack.mockClear()
  confirm.mockClear()
  for (const fn of Object.values(toast)) fn.mockClear()
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

describe('the trip form on a Shared Car', () => {
  it('marks Shared Cars in the car picker with how many people are on them', () => {
    const tree = render()
    const options = carPicker(tree)!.props.selectProps.data
    expect(options).toEqual([
      { label: 'Civic', value: 'civic' },
      {
        label: 'Family Minivan · 3 people',
        value: 'van',
        systemImage: 'person.2',
      },
      {
        label: 'Mazda CX-5 · 2 people',
        value: 'mazda',
        systemImage: 'person.2',
      },
    ])
  })

  it('says who sees the note, and offers no photos, only on a Shared Car', () => {
    const tree = render()
    // The User's own Civic, the car they last logged a trip on.
    expect(carPicker(tree)!.props.selectProps.value).toBe('civic')
    expect(noteRow(tree).props.allowImages).toBe(true)
    expect(noteRow(tree).props.description).toBeUndefined()

    chooseCar(tree, 'van')
    expect(noteRow(tree).props.allowImages).toBe(false)
    expect(noteRow(tree).props.description).toBe(
      'Shared with 2 other people on this car.'
    )
  })

  it('keeps a shared trip within what a Shared Car holds, cutting nothing', () => {
    const tree = render()
    chooseCar(tree, 'van')
    type(tree, 'Distance (mi)', '12')
    const long = 'Territory 12, '.repeat(1500)
    act(() => noteRow(tree).props.onChange({ note: long, noteDoc: undefined }))

    const message = byTestId(tree, 'trip-note-too-large')
    expect(message).toHaveLength(1)
    expect(textOf(message[0])).toBe(
      'This note is too long to share on this car. Shorten it to save the trip.'
    )
    const before = allTrips().length
    save(tree)
    expect(allTrips()).toHaveLength(before)
    expect(navigation.goBack).not.toHaveBeenCalled()

    // The same note fits one of the User's own cars, which share nothing.
    chooseCar(tree, 'civic')
    expect(byTestId(tree, 'trip-note-too-large')).toHaveLength(0)
    save(tree)
    const saved = useMileage.getState().trips.find((t) => t.id === 'uuid-1')
    expect(saved).toMatchObject({ vehicleId: 'civic', distanceMiles: 12 })
    expect(saved?.note?.length).toBe(long.trim().length)
    expect(navigation.goBack).toHaveBeenCalledOnce()
  })

  it('saves a shared trip with a note that fits', () => {
    const tree = render()
    chooseCar(tree, 'van')
    type(tree, 'Distance (mi)', '12')
    act(() =>
      noteRow(tree).props.onChange({ note: 'Territory 12', noteDoc: undefined })
    )
    expect(byTestId(tree, 'trip-note-too-large')).toHaveLength(0)
    save(tree)
    const van = useSharedCars.getState().cars['van-space']
    expect(van.trips.find((t) => t.id === 'uuid-1')).toMatchObject({
      vehicleId: 'van',
      note: 'Territory 12',
      loggedBy: 'me-van-space',
    })
  })
})

describe('odometer readings that overlap another trip', () => {
  it('warns gently, and still saves', () => {
    seed([
      odometerTrip('earlier', 'civic', 1000, 1020),
      odometerTrip('on-van', 'van', 900, 2000),
    ])
    const tree = render()
    useOdometer(tree)
    type(tree, 'Odometer Start (mi)', '1010')
    type(tree, 'Odometer End (mi)', '1030')

    const warning = byTestId(tree, 'trip-odometer-overlap')
    expect(warning).toHaveLength(1)
    expect(textOf(warning[0])).toMatch(
      /^These readings overlap a trip on .*2026\.$/
    )
    save(tree)
    expect(
      useMileage.getState().trips.find((t) => t.id === 'uuid-1')
    ).toMatchObject({
      vehicleId: 'civic',
      odometerStartMiles: 1010,
      odometerEndMiles: 1030,
    })
    expect(navigation.goBack).toHaveBeenCalledOnce()
  })

  it('says nothing for readings that only meet, or another car’s', () => {
    seed([
      odometerTrip('earlier', 'civic', 1000, 1020),
      odometerTrip('on-van', 'van', 900, 2000),
    ])
    const tree = render()
    useOdometer(tree)
    // Starts where the last one ended.
    type(tree, 'Odometer Start (mi)', '1020')
    type(tree, 'Odometer End (mi)', '1040')
    expect(byTestId(tree, 'trip-odometer-overlap')).toHaveLength(0)
  })

  it('warns on a Shared Car about someone else’s trip', () => {
    seed([odometerTrip('anas', 'van', 500, 540)])
    const tree = render()
    chooseCar(tree, 'van')
    useOdometer(tree)
    type(tree, 'Odometer Start (mi)', '530')
    type(tree, 'Odometer End (mi)', '560')
    expect(byTestId(tree, 'trip-odometer-overlap')).toHaveLength(1)
  })

  it('leaves out the trip being edited', () => {
    seed([odometerTrip('editing', 'civic', 1000, 1020)])
    const tree = render({ tripId: 'editing' })
    expect(byTestId(tree, 'trip-odometer-overlap')).toHaveLength(0)
    type(tree, 'Odometer End (mi)', '1025')
    expect(byTestId(tree, 'trip-odometer-overlap')).toHaveLength(0)
  })
})

describe('a trip form whose car goes', () => {
  /**
   * The Family Minivan ends here: the car leaves the Shared Cars store, and its
   * copy, under new ids, joins the User's own.
   */
  const endVan = () =>
    act(() => {
      const { ['van-space']: van, ...rest } = useSharedCars.getState().cars
      useSharedCars.setState({ cars: rest })
      useMileage.setState((state) => ({
        vehicles: [...state.vehicles, { ...van.vehicles[0], id: 'van-copy' }],
        trips: [
          ...state.trips,
          ...van.trips.map(({ loggedBy: _l, editedBy: _e, ...trip }) => ({
            ...trip,
            id: `${trip.id}-copy`,
            vehicleId: 'van-copy',
          })),
        ],
      }))
    })

  it('asks for another car for a new trip, saving no trip on no car', () => {
    const tree = render()
    chooseCar(tree, 'van')
    type(tree, 'Distance (mi)', '12')
    endVan()

    expect(carPicker(tree)!.props.selectProps.value).toBeUndefined()
    const before = allTrips()
    save(tree)
    expect(allTrips()).toEqual(before)
    expect(allTrips().some((t) => t.vehicleId === 'van')).toBe(false)
    expect(carPicker(tree)!.props.invalid).toBe(true)
    expect(navigation.goBack).not.toHaveBeenCalled()

    // The copy is one of the User's own cars now, and takes the trip.
    chooseCar(tree, 'van-copy')
    save(tree)
    expect(
      useMileage.getState().trips.find((t) => t.id === 'uuid-1')
    ).toMatchObject({ vehicleId: 'van-copy', distanceMiles: 12 })
  })

  it('says so when the car went between drawing the form and Save', () => {
    const tree = render()
    type(tree, 'Distance (mi)', '12')
    // Save as the User tapped it, from the form drawn while the car was here.
    const tapped = all(tree, 'ActionButton').find(
      (button) => button.props.children === 'Save'
    )!.props.onPress as () => void
    act(() => {
      useMileage.getState().deleteVehicle('civic')
    })
    act(() => tapped())

    expect(toast.error).toHaveBeenCalledWith(
      "That car isn't available anymore. Choose another car."
    )
    expect(allTrips().some((t) => t.vehicleId === 'civic')).toBe(false)
    expect(navigation.goBack).not.toHaveBeenCalled()
  })

  it('closes, once, when the trip it edits goes with its car', () => {
    render({ tripId: 'van-ana' })
    expect(navigation.goBack).not.toHaveBeenCalled()
    endVan()
    expect(navigation.goBack).toHaveBeenCalledOnce()
    expect(allTrips().some((t) => t.vehicleId === 'van')).toBe(false)
  })

  it('closes once after its own Delete', () => {
    const tree = render({ tripId: 'mine' })
    const remove = all(tree, 'Button').find(
      (button) => button.props.accessibilityRole === 'button'
    )!
    act(() => (remove.props.onPress as () => void)())
    expect(confirm).toHaveBeenCalledOnce()
    expect(useMileage.getState().trips.some((t) => t.id === 'mine')).toBe(false)
    expect(navigation.goBack).toHaveBeenCalledOnce()
  })
})
