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
  const host =
    (name: string) =>
    ({ children, ...props }: { children?: ReactNode }) =>
      ReactModule.createElement(name, props, children)
  return { View: host('View'), ScrollView: host('ScrollView') }
})
vi.mock('lucide-react-native', () => ({ Plus: 'Plus' }))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
const navigation = vi.hoisted(() => ({ navigate: vi.fn() }))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => navigation,
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    fonts: {},
    colors: {},
    fontSize: () => 16,
  }),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
const prefs = vi.hoisted(() => ({
  distanceUnit: 'mi',
  fuelEconomyUnit: 'mpgUS',
  set: () => {},
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: (select?: (state: typeof prefs) => unknown) =>
    select ? select(prefs) : prefs,
}))
const confirm = vi.hoisted(() =>
  vi.fn((_options: { description?: string; onConfirm: () => void }) => {})
)
vi.mock('@/lib/confirmDestructive', () => ({ default: confirm }))

const host = vi.hoisted(() => (name: string) => async () => {
  const ReactModule = await import('react')
  return {
    default: (props: { children?: ReactNode }) =>
      ReactModule.createElement(name, props, props.children),
  }
})
vi.mock('@/components/ui/layout/ContentColumn', host('ContentColumn'))
vi.mock('@/components/ui/inputs/Section', host('Section'))
vi.mock('@/components/ui/inputs/InputRowSelect', host('InputRowSelect'))
vi.mock('@/components/ui/Button', host('Button'))
vi.mock('@/components/ui/MyText', host('Text'))
vi.mock('@/features/mileage/components/MileageLinkRow', host('MileageLinkRow'))

import useMileage from '@/stores/mileage'
import useSharedCars from '@/stores/sharedCars'
import { toast } from '@/stores/toasts'
import {
  MileageSharingContext,
  NO_MILEAGE_SHARING,
  type MileageSharing,
  type SharedCarsLeft,
} from '@/features/mileage/hooks/useMileageSharing'
import MileageSettingsScreen from '@/features/mileage/screens/MileageSettingsScreen'
import { peopleFixture } from '@/lib/mileage/testing/peopleFixture'

const SHARED_DESCRIPTION =
  "Deletes your own cars, fuels, and trips on all devices that sync with this one, and leaves your shared cars. You'll keep a copy of each shared car's trips. This can't be undone."
const PLAIN_DESCRIPTION =
  "Deletes every car, fuel, and trip on all devices that sync with this one. This can't be undone."
const NOT_LEFT_MESSAGE =
  "The rest of your mileage data was deleted. Try again when you're connected."

let renderer: ReactTestRenderer | undefined
const toasts = {
  info: vi.spyOn(toast, 'info'),
  success: vi.spyOn(toast, 'success'),
  error: vi.spyOn(toast, 'error'),
}

function render(sharing: Partial<MileageSharing> = {}) {
  const fixture = peopleFixture()
  act(() => {
    renderer = create(
      <MileageSharingContext.Provider
        value={{
          ...NO_MILEAGE_SHARING,
          enabled: true,
          buddies: fixture.buddies,
          ...sharing,
        }}
      >
        <MileageSettingsScreen />
      </MileageSharingContext.Provider>
    )
  })
  return renderer!
}

function requestDeleteAll(tree: ReactTestRenderer) {
  const button = tree.root.find(
    (node) =>
      node.type === ('Button' as never) &&
      node.findAll(
        (child) =>
          child.type === ('Text' as never) &&
          child.props.children === 'Delete All Mileage Data…'
      ).length > 0
  )
  act(() => button.props.onPress())
  return confirm.mock.lastCall![0]
}

function pendingLeave() {
  let finish: (left: SharedCarsLeft) => void = () => {}
  const leaveAll = vi.fn(
    () =>
      new Promise<SharedCarsLeft>((resolve) => {
        finish = resolve
      })
  )
  return { leaveAll, finish: (left: SharedCarsLeft) => finish(left) }
}

function seedOwn() {
  useMileage.getState()._WARNING_forceDeleteMileage()
  useMileage.setState({
    vehicles: [{ id: 'civic', name: 'Civic', createdAt: 1 }],
    trips: [peopleFixture().trips.mine],
  })
}

beforeEach(() => {
  seedOwn()
  useSharedCars.setState(useSharedCars.getInitialState(), true)
  useSharedCars.setState({ cars: peopleFixture().cars })
  confirm.mockClear()
  navigation.navigate.mockClear()
  for (const spy of Object.values(toasts)) spy.mockClear()
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

describe('Mileage Settings', () => {
  it('shows how many people are on each Shared Car', () => {
    const rows = render()
      .root.findAll((node) => node.type === ('MileageLinkRow' as never))
      .map((node) => node.props as { label: string; people?: number })
    expect(
      rows
        .filter((row) =>
          ['Civic', 'Family Minivan', 'Mazda CX-5'].includes(row.label)
        )
        .map(({ label, people }) => ({ label, people }))
    ).toEqual([
      { label: 'Civic', people: undefined },
      { label: 'Family Minivan', people: 3 },
      { label: 'Mazda CX-5', people: 2 },
    ])
  })
})

describe('Delete All Mileage Data', () => {
  it('says it leaves the User’s Shared Cars, keeping a copy, when they’re on one', () => {
    expect(requestDeleteAll(render()).description).toBe(SHARED_DESCRIPTION)
  })

  it('says so for a car the roster brought that hasn’t reached this device', () => {
    useSharedCars.setState({
      cars: {},
      memberships: { cars: { 'roster-space': { at: 5 } }, leftCars: {} },
    })
    expect(requestDeleteAll(render()).description).toBe(SHARED_DESCRIPTION)
  })

  it('reads as it always did without Shared Cars', () => {
    useSharedCars.setState({ cars: {} })
    expect(requestDeleteAll(render()).description).toBe(PLAIN_DESCRIPTION)
  })

  it('deletes the User’s own mileage, leaves every Shared Car, then says it’s done', async () => {
    const { leaveAll, finish } = pendingLeave()
    const options = requestDeleteAll(render({ leaveAll }))

    await act(async () => options.onConfirm())

    expect(useMileage.getState().vehicles).toEqual([])
    expect(useMileage.getState().trips).toEqual([])
    expect(leaveAll).toHaveBeenCalledOnce()
    expect(toasts.info).toHaveBeenCalledWith('Deleting mileage data…', {
      key: 'mileage-delete-all',
    })

    expect(toasts.success).not.toHaveBeenCalled()

    await act(async () => finish({ notLeft: [] }))
    await vi.waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith('Success', {
        key: 'mileage-delete-all',
        message: 'Deleted',
      })
    )
    expect(toasts.error).not.toHaveBeenCalled()
  })

  it('names the car it couldn’t leave yet', async () => {
    const leaveAll = vi.fn(async () => ({ notLeft: [{ name: 'Mazda CX-5' }] }))
    const options = requestDeleteAll(render({ leaveAll }))

    await act(async () => options.onConfirm())
    await vi.waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith(
        "Couldn't leave Mazda CX-5 yet",
        {
          key: 'mileage-delete-all',
          message: NOT_LEFT_MESSAGE,
        }
      )
    )
    expect(toasts.success).not.toHaveBeenCalled()
  })

  it('counts the cars it couldn’t leave, or one that never synced its name', async () => {
    const outcomes: [SharedCarsLeft, string][] = [
      [
        { notLeft: [{ name: 'Mazda CX-5' }, { name: 'Family Minivan' }] },
        "Couldn't leave 2 shared cars yet",
      ],
      [{ notLeft: [{ name: '' }] }, "Couldn't leave a shared car yet"],
    ]
    for (const [left, title] of outcomes) {
      toasts.error.mockClear()
      const options = requestDeleteAll(
        render({ leaveAll: vi.fn(async () => left) })
      )
      await act(async () => options.onConfirm())
      await vi.waitFor(() =>
        expect(toasts.error).toHaveBeenCalledWith(title, {
          key: 'mileage-delete-all',
          message: NOT_LEFT_MESSAGE,
        })
      )
      act(() => renderer?.unmount())
      seedOwn()
    }
  })

  it('leaves nothing, and says it’s done, without Shared Cars', async () => {
    useSharedCars.setState({ cars: {} })
    const leaveAll = vi.fn(async () => ({ notLeft: [] }))
    const options = requestDeleteAll(render({ leaveAll }))

    await act(async () => options.onConfirm())
    await vi.waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith('Success', {
        key: 'mileage-delete-all',
        message: 'Deleted',
      })
    )
    expect(leaveAll).not.toHaveBeenCalled()
    expect(toasts.info).not.toHaveBeenCalled()
    expect(useMileage.getState().vehicles).toEqual([])
  })
})
