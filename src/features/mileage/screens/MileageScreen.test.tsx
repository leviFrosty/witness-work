import React, { type ReactElement, type ReactNode } from 'react'
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
  return {
    View: host('View'),
    ScrollView: host('ScrollView'),
    RefreshControl: host('RefreshControl'),
  }
})
vi.mock('lucide-react-native', () => ({
  Plus: 'Plus',
  Settings: 'Settings',
  Share: 'Share',
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: vi.fn() }),
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    fonts: {},
    colors: { accent: 'accent', accent2: 'accent2', accent3: 'accent3' },
  }),
}))
const analytics = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ analytics }))
vi.mock('@/stores/preferences', () => {
  const prefs = { distanceUnit: 'mi', fuelEconomyUnit: 'mpgUS' }
  return {
    usePreferences: (select?: (state: typeof prefs) => unknown) =>
      select ? select(prefs) : prefs,
  }
})
vi.mock('@/hooks/useStartOfWeek', () => ({ default: () => 0 }))
vi.mock('@/features/mileage/hooks/useLogTrip', () => ({
  default: () => () => {},
}))
const exportReport = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/features/mileage/hooks/useMileageExport', () => ({
  default: () => ({ exportReport }),
}))

const host = vi.hoisted(() => (name: string) => async () => {
  const ReactModule = await import('react')
  return {
    default: (props: { children?: ReactNode }) =>
      ReactModule.createElement(name, props, props.children),
  }
})

vi.mock('@/components/ui/layout/Header', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ rightElement }: { rightElement?: ReactNode }) =>
      ReactModule.createElement('Header', null, rightElement),
  }
})
vi.mock('@/components/ui/Card', host('Card'))
vi.mock('@/components/ui/IconButton', host('IconButton'))
vi.mock('@/components/ui/PullDownMenu', host('PullDownMenu'))
vi.mock('@/components/ui/PointerTooltip', host('PointerTooltip'))
vi.mock('@/components/SwipeMonthNavigator', host('SwipeMonthNavigator'))
vi.mock(
  '@/features/mileage/components/PeriodNavigator',
  host('PeriodNavigator')
)
vi.mock('@/features/mileage/components/MileageSummary', host('MileageSummary'))
vi.mock(
  '@/features/mileage/components/MileagePeriodChart',
  host('MileagePeriodChart')
)
vi.mock('@/features/mileage/components/TripRow', host('TripRow'))
vi.mock(
  '@/features/mileage/components/MileageEmptyState',
  host('MileageEmptyState')
)
vi.mock('@/features/mileage/components/LogTripButton', host('LogTripButton'))
vi.mock(
  '@/features/mileage/components/MileagePersonFilter',
  host('MileagePersonFilter')
)
vi.mock(
  '@/features/mileage/components/SharedCarsNotice',
  host('SharedCarsNotice')
)

import useMileage from '@/stores/mileage'
import useSharedCars from '@/stores/sharedCars'
import { EVERYONE, ME, type CarPerson } from '@/lib/mileage/people'
import type { MileageSummary } from '@/lib/mileage/calc'
import type { MileageReportInput } from '@/features/mileage/lib/report'
import {
  MileageSharingContext,
  NO_MILEAGE_SHARING,
  type MileageSharing,
} from '@/features/mileage/hooks/useMileageSharing'
import MileageScreen from '@/features/mileage/screens/MileageScreen'
import { peopleFixture } from '@/lib/mileage/testing/peopleFixture'
import type { Trip } from '@/types/mileage'

const NOW = new Date(2026, 2, 15, 12)

let renderer: ReactTestRenderer | undefined

function render(sharing: Partial<MileageSharing> = {}) {
  const fixture = peopleFixture()
  act(() => {
    renderer = create(
      <MileageSharingContext.Provider
        value={{
          ...NO_MILEAGE_SHARING,
          enabled: true,
          buddies: fixture.buddies,
          ownName: 'Levi W.',
          ...sharing,
        }}
      >
        <MileageScreen />
      </MileageSharingContext.Provider>
    )
  })
  return renderer!
}

const byType = (tree: ReactTestRenderer, type: string) =>
  tree.root.findAll((node) => node.type === (type as never))
const one = (tree: ReactTestRenderer, type: string) => {
  const [node] = byType(tree, type)
  return node
}

function shown(tree: ReactTestRenderer) {
  const summary = one(tree, 'MileageSummary').props as {
    summary: MileageSummary
    chart: ReactElement<{ trips: readonly Trip[] }>
  }
  const rows = byType(tree, 'TripRow').map(
    (node) =>
      node.props as {
        trip: Trip
        vehicleName?: string
        loggedBy?: CarPerson
      }
  )
  return {
    distance: summary.summary.distanceMiles,
    tripCount: summary.summary.tripCount,
    chart: summary.chart.props.trips.map((trip) => trip.id).sort(),
    rows: rows.map((row) => row.trip.id).sort(),
    loggedBy: Object.fromEntries(
      rows
        .filter((row) => row.loggedBy)
        .map((row) => [row.trip.id, row.loggedBy!.name])
    ),
  }
}

async function exportInput(tree: ReactTestRenderer) {
  const menu = one(tree, 'PullDownMenu').props as {
    actions: { id: string; onPress: () => void }[]
  }
  exportReport.mockClear()
  await act(async () => menu.actions.find((a) => a.id === 'csv')!.onPress())
  const [method, input] = exportReport.mock.lastCall as unknown as [
    string,
    MileageReportInput,
  ]
  expect(method).toBe('csv')
  return {
    trips: input.trips.map((trip) => trip.id).sort(),
    filter: input.sharing?.filter,
    ownName: input.sharing?.ownName,
  }
}

const choose = (tree: ReactTestRenderer, filter: string) =>
  act(() => one(tree, 'MileagePersonFilter').props.onChange(filter))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  const fixture = peopleFixture()
  useMileage.getState()._WARNING_forceDeleteMileage()
  useMileage.setState({
    vehicles: [fixture.vehicles[0]],
    trips: [fixture.trips.mine],
  })
  useSharedCars.setState(useSharedCars.getInitialState(), true)
  useSharedCars.setState({ cars: fixture.cars })
  analytics.capture.mockClear()
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.useRealTimers()
})

describe('the Mileage screen’s person filter', () => {
  it('shows everyone’s trips at first, naming whoever else logged one', async () => {
    const tree = render()
    expect(one(tree, 'MileagePersonFilter').props.value).toBe(EVERYONE)
    expect(shown(tree)).toEqual({
      distance: 210,
      tripCount: 6,
      chart: ['mazda-ana', 'mine', 'van-ana', 'van-ben', 'van-cal', 'van-mine'],
      rows: ['mazda-ana', 'mine', 'van-ana', 'van-ben', 'van-cal', 'van-mine'],

      loggedBy: {
        'van-ana': 'Annie',
        'van-ben': 'Ben',
        'van-cal': 'Cal',
        'mazda-ana': 'Annie',
      },
    })
    expect(
      byType(tree, 'TripRow').find((node) => node.props.trip.id === 'van-ana')
        ?.props.vehicleName
    ).toBe('Family Minivan')
    expect(await exportInput(tree)).toEqual({
      trips: ['mazda-ana', 'mine', 'van-ana', 'van-ben', 'van-cal', 'van-mine'],
      filter: EVERYONE,
      ownName: 'Levi W.',
    })
  })

  it('keeps only the User’s trips for Me, everywhere on the screen', async () => {
    const tree = render()
    choose(tree, ME)

    expect(one(tree, 'MileagePersonFilter').props.value).toBe(ME)
    expect(shown(tree)).toEqual({
      distance: 30,
      tripCount: 2,
      chart: ['mine', 'van-mine'],
      rows: ['mine', 'van-mine'],
      loggedBy: {},
    })
    expect(await exportInput(tree)).toEqual({
      trips: ['mine', 'van-mine'],
      filter: ME,
      ownName: 'Levi W.',
    })
    expect(analytics.capture).toHaveBeenCalledWith(
      'mileage_person_filter_used',
      { filter: 'me' }
    )
  })

  it('keeps one person’s trips, on every car they share with the User', async () => {
    const tree = render()
    choose(tree, 'buddy:inbox-ana')

    expect(shown(tree)).toEqual({
      distance: 90,
      tripCount: 2,
      chart: ['mazda-ana', 'van-ana'],
      rows: ['mazda-ana', 'van-ana'],
      loggedBy: { 'van-ana': 'Annie', 'mazda-ana': 'Annie' },
    })
    expect(await exportInput(tree)).toEqual({
      trips: ['mazda-ana', 'van-ana'],
      filter: 'buddy:inbox-ana',
      ownName: 'Levi W.',
    })
    expect(analytics.capture).toHaveBeenCalledWith(
      'mileage_person_filter_used',
      { filter: 'person' }
    )

    choose(tree, EVERYONE)
    expect(shown(tree).tripCount).toBe(6)
  })

  it('goes back to Everyone once the person shown has left every car', () => {
    const tree = render()
    choose(tree, `van-space/ben`)
    expect(shown(tree).rows).toEqual(['van-ben'])

    act(() => {
      const { cars } = useSharedCars.getState()
      const van = cars['van-space']
      useSharedCars.setState({
        cars: {
          ...cars,
          'van-space': {
            ...van,
            members: van.members.filter((m) => m.memberId !== 'ben'),
          },
        },
      })
    })
    expect(one(tree, 'MileagePersonFilter').props.value).toBe(EVERYONE)
    expect(shown(tree).tripCount).toBe(6)
  })
})

describe('the Mileage screen with Shared Cars', () => {
  it('syncs every Shared Car on a pull, showing it’s refreshing meanwhile', async () => {
    let finish = () => {}
    const sync = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const tree = render({ sync })
    const control = () =>
      one(tree, 'ScrollView').props.refreshControl as ReactElement<{
        refreshing: boolean
        onRefresh: () => void
      }>

    expect(control().props.refreshing).toBe(false)
    await act(async () => control().props.onRefresh())
    expect(sync).toHaveBeenCalledOnce()
    expect(control().props.refreshing).toBe(true)
    await act(async () => finish())
    expect(control().props.refreshing).toBe(false)
    expect(one(tree, 'SharedCarsNotice').props.hasSharedCars).toBe(true)
  })

  it('still filters and says who logged each trip while Shared Cars is off here, but doesn’t sync', async () => {
    const sync = vi.fn(async () => {})
    const tree = render({ enabled: false, sync })

    expect(one(tree, 'MileagePersonFilter')).toBeDefined()
    expect(shown(tree).loggedBy['van-ana']).toBe('Annie')
    expect(one(tree, 'ScrollView').props.refreshControl).toBeUndefined()

    expect(one(tree, 'SharedCarsNotice').props.hasSharedCars).toBe(true)
    choose(tree, ME)
    expect(shown(tree).rows).toEqual(['mine', 'van-mine'])
    expect((await exportInput(tree)).filter).toBe(ME)
    expect(sync).not.toHaveBeenCalled()
  })

  it('looks as it did before Shared Cars without one', async () => {
    useSharedCars.setState({ cars: {} })
    const tree = render()

    expect(byType(tree, 'MileagePersonFilter')).toEqual([])
    expect(one(tree, 'ScrollView').props.refreshControl).toBeUndefined()
    expect(one(tree, 'SharedCarsNotice').props.hasSharedCars).toBe(false)
    expect(shown(tree)).toMatchObject({
      distance: 10,
      rows: ['mine'],
      loggedBy: {},
    })
    expect(await exportInput(tree)).toEqual({
      trips: ['mine'],
      filter: undefined,
      ownName: undefined,
    })
  })
})
