import React, { type ReactNode } from 'react'
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer'
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

const mocks = vi.hoisted(() => ({
  alert: vi.fn(),
  goBack: vi.fn(),
  replace: vi.fn(),
  uuid: 0,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('react-native', async () => {
  const ReactModule = await import('react')
  return {
    View: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('View', null, children),
    Alert: { alert: mocks.alert },
  }
})
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
vi.mock('expo-crypto', () => ({
  randomUUID: () => `uuid-${++mocks.uuid}`,
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/stores/toasts', () => ({ toast: mocks.toast }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: { accent: 'accent', error: 'error' },
    fonts: { semiBold: 'semiBold' },
    fontSize: () => 16,
  }),
}))

vi.mock('@/features/mileage/hooks/useMileageFormatter', async () => {
  const { createMileageFormatter, resolveMileageUnits } = await import(
    '@/features/mileage/lib/format'
  )
  const format = createMileageFormatter(
    resolveMileageUnits({ distanceUnit: 'mi', fuelEconomyUnit: 'mpgUS' })
  )
  return { default: () => format }
})

const host = vi.hoisted(() => (name: string) => async () => {
  const ReactModule = await import('react')
  return {
    default: (props: { children?: ReactNode }) =>
      ReactModule.createElement(name, props, props.children),
  }
})
vi.mock('@/components/ui/layout/Wrapper', host('Wrapper'))
vi.mock('@/components/ui/layout/ContentColumn', host('ContentColumn'))
vi.mock(
  '@/components/ui/layout/KeyboardAwareScrollView',
  host('KeyboardAwareScrollView')
)
vi.mock('@/components/ui/inputs/Section', host('Section'))
vi.mock('@/components/ui/inputs/TextInputRow', host('TextInputRow'))
vi.mock('@/components/ui/inputs/InputRowSelect', host('InputRowSelect'))
vi.mock('@/components/ui/inputs/InputLayout', () => ({
  inputLayout: { horizontalPadding: 0 },
}))
vi.mock('@/components/ui/ActionButton', host('ActionButton'))
vi.mock('@/components/ui/Button', host('Button'))
vi.mock('@/components/ui/MyText', host('Text'))
vi.mock(
  '@/features/mileage/components/HistoryChangeRow',
  host('HistoryChangeRow')
)
vi.mock('@/features/mileage/components/HistoryList', host('HistoryList'))
vi.mock(
  '@/features/mileage/components/SharedCarsNotice',
  host('SharedCarsNotice')
)

import useMileage from '@/stores/mileage'
import useSharedCars from '@/stores/sharedCars'
import { getMileageView } from '@/stores/mileageView'
import { sharedCar } from '@/lib/mileage/testing/sharedCars'
import MileageVehicleFormScreen, {
  type CarPeopleSlot,
} from '@/features/mileage/screens/MileageVehicleFormScreen'
import type { Fuel, Vehicle, VehicleSetup } from '@/types/mileage'

const NOW = new Date(2026, 9, 29, 9).getTime()
const TODAY = '2026-10-29'
const SPACE = 'van-space'

const civic: Vehicle = { id: 'civic', name: 'Civic', createdAt: 1 }
const van: Vehicle = { id: 'van', name: 'Family Minivan', createdAt: 1 }
const fuel = (id: string, name = 'Gasoline'): Fuel => ({
  id,
  name,
  createdAt: 1,
})
const setup = (
  id: string,
  vehicleId: string,
  fuelId: string | undefined,
  milesPerGallon = 30
): VehicleSetup => ({
  id,
  vehicleId,
  effectiveFrom: '2026-01-01',
  fuelId,
  milesPerGallon,
})

type SelectProps = {
  data: { label: string; value: string }[]
  value: string
  onChange: (item: { value: string }) => void
}
type InputProps = {
  value: string
  onChangeText: (text: string) => void
}

let renderer: ReactTestRenderer | undefined
const navigation = {
  canGoBack: vi.fn(() => true),
  goBack: mocks.goBack,
  replace: mocks.replace,
}

function render(
  vehicleId: string | undefined,
  renderPeople?: CarPeopleSlot
): ReactTestRenderer {
  const props = {
    route: { params: vehicleId === undefined ? undefined : { vehicleId } },
    navigation,
    renderPeople,
  } as unknown as React.ComponentProps<typeof MileageVehicleFormScreen>
  act(() => {
    renderer = create(<MileageVehicleFormScreen {...props} />)
  })
  return renderer!
}

const select = (tree: ReactTestRenderer) =>
  tree.root.find((node) => node.type === ('InputRowSelect' as never)).props
    .selectProps as SelectProps
const input = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(
    (node) =>
      node.type === ('TextInputRow' as never) && node.props.label === label
  ).props.textInputProps as InputProps
const save = (tree: ReactTestRenderer) =>
  act(() =>
    tree.root
      .find((node) => node.type === ('ActionButton' as never))
      .props.onPress()
  )
const texts = (node: ReactTestInstance) =>
  node.findAll((child) => child.type === ('Text' as never))

function button(tree: ReactTestRenderer, label: string) {
  const found = tree.root.findAll(
    (node) =>
      node.type === ('Button' as never) &&
      texts(node).some((text) => text.props.children === label)
  )
  if (found.length === 0) return undefined
  const text = texts(found[0]).find((t) => t.props.children === label)!
  return {
    press: () => act(() => found[0].props.onPress()),
    color: (text.props.style as { color?: string }).color,
  }
}
type AlertButton = {
  text: string
  style?: string
  onPress?: () => void
}
const lastAlert = () => {
  const [title, , buttons] = mocks.alert.mock.lastCall as [
    string,
    string,
    AlertButton[],
  ]
  return { title, buttons }
}
const notice = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => node.type === ('SharedCarsNotice' as never))

const shared = () => useSharedCars.getState().cars[SPACE]
const ownCar = () =>
  useMileage.setState({
    vehicles: [civic],
    fuels: [fuel('gas'), fuel('diesel', 'Diesel')],
    vehicleSetups: [setup('setup', 'civic', 'gas')],
  })
const sharedVan = () =>
  useSharedCars.getState().saveSharedCar(
    sharedCar(SPACE, {
      vehicles: [van],
      fuels: [fuel('gas-copy'), fuel('diesel-copy', 'Diesel')],
      vehicleSetups: [setup('van-setup', 'van', 'gas-copy')],
    })
  )

function shareCivic() {
  act(() => {
    useSharedCars.getState().saveSharedCar(
      sharedCar(SPACE, {
        vehicles: [civic],
        fuels: [fuel('gas-copy')],
        vehicleSetups: [setup('setup', 'civic', 'gas-copy')],
      })
    )
    useMileage.getState().deleteVehicle('civic')
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  useMileage.getState()._WARNING_forceDeleteMileage()
  useSharedCars.setState(useSharedCars.getInitialState(), true)
  mocks.uuid = 0
  mocks.alert.mockClear()
  mocks.goBack.mockClear()
  mocks.replace.mockClear()
  for (const fn of Object.values(mocks.toast)) fn.mockClear()
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.useRealTimers()
})

describe('the car form, as the car changes under it', () => {
  it('saves no stale fuel after Share Car… moves the car to its own fuels', () => {
    ownCar()
    const tree = render('civic')
    expect(select(tree).value).toBe('gas')

    shareCivic()
    expect(select(tree).value).toBe('gas-copy')
    save(tree)

    expect(shared().vehicles).toEqual([
      expect.objectContaining({ id: 'civic', name: 'Civic' }),
    ])
    expect(shared().vehicleSetups).toEqual([
      expect.objectContaining({ id: 'setup', fuelId: 'gas-copy' }),
    ])
    expect(
      getMileageView().vehicleSetups.filter((s) => s.fuelId === 'gas')
    ).toEqual([])
    expect(useMileage.getState().vehicleSetups).toEqual([])
    expect(mocks.goBack).toHaveBeenCalledOnce()
  })

  it('keeps an economy typed before sharing, on the car’s own fuel', () => {
    ownCar()
    const tree = render('civic')
    act(() => input(tree, 'Fuel Economy (mpg)').onChangeText('35'))

    shareCivic()
    expect(select(tree).value).toBe('gas-copy')
    expect(input(tree, 'Fuel Economy (mpg)').value).toBe('35')
    save(tree)

    expect(shared().vehicleSetups).toEqual([
      expect.objectContaining({ id: 'setup', fuelId: 'gas-copy' }),
      expect.objectContaining({
        vehicleId: 'civic',
        effectiveFrom: TODAY,
        fuelId: 'gas-copy',
        milesPerGallon: 35,
      }),
    ])
    expect(getMileageView().vehicleSetups.some((s) => s.fuelId === 'gas')).toBe(
      false
    )
  })

  it('keeps someone else’s rename and fuel when the User changed neither', () => {
    sharedVan()
    const tree = render('van')
    expect(input(tree, 'Name').value).toBe('Family Minivan')
    expect(select(tree).value).toBe('gas-copy')

    act(() => {
      useSharedCars.getState().updateSharedCar(SPACE, (car) => ({
        ...car,
        vehicles: [{ ...van, name: 'The Van', updatedAt: 5 }],
        vehicleSetups: [
          { ...setup('van-setup', 'van', 'diesel-copy'), updatedAt: 5 },
        ],
      }))
    })
    expect(input(tree, 'Name').value).toBe('The Van')
    expect(select(tree).value).toBe('diesel-copy')
    save(tree)

    expect(shared().vehicles[0].name).toBe('The Van')
    expect(shared().vehicleSetups).toEqual([
      expect.objectContaining({ id: 'van-setup', fuelId: 'diesel-copy' }),
    ])
  })

  it('saves what the User typed over what changed meanwhile', () => {
    sharedVan()
    const tree = render('van')
    act(() => input(tree, 'Name').onChangeText('Our Van'))
    act(() => {
      useSharedCars.getState().updateSharedCar(SPACE, (car) => ({
        ...car,
        vehicles: [{ ...van, name: 'The Van', updatedAt: 5 }],
      }))
    })
    expect(input(tree, 'Name').value).toBe('Our Van')
    save(tree)
    expect(shared().vehicles[0].name).toBe('Our Van')
  })
})

describe('removing a car', () => {
  it('only archives a Shared Car, for everyone, styled as no loss', () => {
    sharedVan()
    const tree = render('van')
    expect(button(tree, 'Archive or Delete…')).toBeUndefined()
    expect(button(tree, 'Delete…')).toBeUndefined()
    const archive = button(tree, 'Archive…')!
    expect(archive.color).toBe('accent')

    archive.press()
    const { title, buttons } = lastAlert()
    expect(title).toBe('Archive this car?')
    expect(buttons.map(({ text, style }) => ({ text, style }))).toEqual([
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: undefined },
    ])

    act(() => buttons[1].onPress?.())
    expect(shared().vehicles[0]).toMatchObject({ id: 'van', archived: true })
    expect(useMileage.getState().vehicles).toEqual([])
    expect(mocks.toast.success).toHaveBeenCalledWith('Car archived')
    expect(mocks.goBack).toHaveBeenCalledOnce()
  })

  it('offers archiving or deleting one of the User’s own, as destructive', () => {
    ownCar()
    const tree = render('civic')
    const remove = button(tree, 'Archive or Delete…')!
    expect(remove.color).toBe('error')

    remove.press()
    expect(
      lastAlert().buttons.map(({ text, style }) => ({ text, style }))
    ).toEqual([
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: undefined },
      { text: 'Delete', style: 'destructive' },
    ])
  })

  it('closes once after its own Delete', () => {
    ownCar()
    const tree = render('civic')
    button(tree, 'Archive or Delete…')!.press()
    const destructive = lastAlert().buttons.find(
      (b) => b.style === 'destructive'
    )!
    act(() => destructive.onPress?.())

    expect(useMileage.getState().vehicles).toEqual([])
    expect(mocks.goBack).toHaveBeenCalledOnce()

    act(() => {
      useMileage.getState().saveFuel(fuel('ev', 'Electric'))
    })
    expect(mocks.goBack).toHaveBeenCalledOnce()
  })
})

describe('closing when the car goes', () => {
  it('closes once the car is deleted on another device', () => {
    ownCar()
    render('civic')
    expect(mocks.goBack).not.toHaveBeenCalled()
    act(() => {
      useMileage.getState().deleteVehicle('civic')
    })
    expect(mocks.goBack).toHaveBeenCalledOnce()
  })

  it('closes once a Shared Car ends here', () => {
    sharedVan()
    render('van')
    act(() => useSharedCars.getState().removeSharedCar(SPACE))
    expect(mocks.goBack).toHaveBeenCalledOnce()
  })

  it('shows the cars instead when there’s nothing to go back to', () => {
    sharedVan()
    navigation.canGoBack.mockReturnValueOnce(false)
    render('van')
    act(() => useSharedCars.getState().removeSharedCar(SPACE))
    expect(mocks.goBack).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith('MileageSettings')
  })

  it('stays open on a new car', () => {
    ownCar()
    render(undefined)
    expect(mocks.goBack).not.toHaveBeenCalled()
  })
})

describe('the car’s fuels', () => {
  it('offers a Shared Car only its own fuels', () => {
    ownCar()
    sharedVan()
    const tree = render('van')
    expect(select(tree).data).toEqual([
      { label: 'None', value: '__none__' },
      { label: 'Gasoline', value: 'gas-copy' },
      { label: 'Diesel', value: 'diesel-copy' },
      { label: 'New Fuel…', value: '__new__' },
    ])
  })

  it('offers one of the User’s own cars only their fuels', () => {
    ownCar()
    sharedVan()
    const tree = render('civic')
    expect(select(tree).data).toEqual([
      { label: 'None', value: '__none__' },
      { label: 'Gasoline', value: 'gas' },
      { label: 'Diesel', value: 'diesel' },
      { label: 'New Fuel…', value: '__new__' },
    ])
  })

  it('puts a new fuel made in a Shared Car’s form on that car', () => {
    ownCar()
    sharedVan()
    const tree = render('van')
    act(() => select(tree).onChange({ value: '__new__' }))
    act(() => input(tree, 'Fuel Name').onChangeText('Electric'))
    act(() => input(tree, 'Price per Gallon').onChangeText('0.15'))
    save(tree)

    const electric = shared().fuels.find((f) => f.name === 'Electric')
    expect(electric).toBeDefined()
    expect(shared().fuelPrices).toEqual([
      expect.objectContaining({
        fuelId: electric!.id,
        effectiveFrom: TODAY,
        pricePerGallon: 0.15,
      }),
    ])
    expect(shared().vehicleSetups.at(-1)).toMatchObject({
      vehicleId: 'van',
      fuelId: electric!.id,
    })
    expect(useMileage.getState().fuels.map((f) => f.id)).toEqual([
      'gas',
      'diesel',
    ])
    expect(useMileage.getState().fuelPrices).toEqual([])
    expect(useMileage.getState().vehicleSetups).toEqual([
      setup('setup', 'civic', 'gas'),
    ])
  })
})

describe('what the form shows of sharing', () => {
  it('says when a Shared Car’s changes aren’t being shared, for that car', () => {
    sharedVan()
    expect(notice(render('van')).map((node) => node.props)).toEqual([
      { hasSharedCars: true, spaceId: SPACE },
    ])
  })

  it('shows no notice on one of the User’s own cars', () => {
    ownCar()
    expect(notice(render('civic'))).toEqual([])
  })

  it('shows the People slot for a saved car, by its id', () => {
    ownCar()
    const People = (props: { vehicleId: string }) =>
      React.createElement('People', props)
    const renderPeople = vi.fn(({ vehicleId }: { vehicleId: string }) => (
      <People vehicleId={vehicleId} />
    ))
    const tree = render('civic', renderPeople)
    expect(renderPeople).toHaveBeenCalledWith({ vehicleId: 'civic' })
    expect(
      tree.root.findAll((node) => node.type === ('People' as never))
    ).toHaveLength(1)

    act(() => tree.unmount())
    renderer = undefined
    renderPeople.mockClear()
    render(undefined, renderPeople)
    expect(renderPeople).not.toHaveBeenCalled()
  })
})
