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
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: vi.fn() }),
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
vi.mock('@/hooks/useAccessibilityTextSize', () => ({ default: () => false }))
vi.mock('@/components/ui/Card', () => ({
  useCardStyle: () => ({ borderRadius: 12 }),
}))

const host = vi.hoisted(() => (name: string) => async () => {
  const ReactModule = await import('react')
  return {
    default: (props: { children?: ReactNode }) =>
      ReactModule.createElement(name, props, props.children),
  }
})

const drawn = vi.hoisted(() => new Map<string, number>())
vi.mock('@/components/ui/ContextMenu', async () => {
  const ReactModule = await import('react')
  return {
    default: (props: { accessibilityLabel: string; children?: ReactNode }) => {
      drawn.set(
        props.accessibilityLabel,
        (drawn.get(props.accessibilityLabel) ?? 0) + 1
      )
      return ReactModule.createElement('ContextMenu', props, props.children)
    },
  }
})
vi.mock('@/components/ui/SwipeableRow', host('SwipeableRow'))
vi.mock('@/components/ui/swipeableActions/Delete', host('SwipeableDelete'))
vi.mock('@/components/ui/MyText', host('Text'))
vi.mock('@/components/ui/Avatar', host('Avatar'))
vi.mock('@/components/RichNote', host('RichNote'))

import { Share } from 'react-native'
import useMileage from '@/stores/mileage'
import useSharedCars from '@/stores/sharedCars'
import { useMileageView } from '@/stores/mileageView'
import {
  MileageSharingContext,
  NO_MILEAGE_SHARING,
  useMileagePeople,
} from '@/features/mileage/hooks/useMileageSharing'
import useTripActions from '@/features/mileage/hooks/useTripActions'
import TripRow from '@/features/mileage/components/TripRow'
import {
  buildMileagePeople,
  type MileageBuddy,
  type MileagePeople,
} from '@/lib/mileage/people'
import { peopleFixture } from '@/lib/mileage/testing/peopleFixture'
import type { SharedCar } from '@/types/sharedCars'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

type Found = { props: Record<string, unknown> }

let renderer: ReactTestRenderer | undefined
let parentRenders = 0
let seen: MileagePeople[] = []
let actions: ReturnType<typeof useTripActions> | undefined

function TripList() {
  parentRenders++
  const people = useMileagePeople()
  const trips = useMileageView((view) => view.trips)
  actions = useTripActions()
  seen.push(people)
  return (
    <>
      {trips.map((trip) => {
        const author = people.loggedBy(trip)
        return (
          <TripRow
            key={trip.id}
            trip={trip}
            loggedBy={author && !author.me ? author : undefined}
          />
        )
      })}
    </>
  )
}

function render(buddies: readonly MileageBuddy[]) {
  act(() => {
    renderer = create(
      <MileageSharingContext.Provider
        value={{
          ...NO_MILEAGE_SHARING,
          enabled: true,

          buddies: buddies.map((buddy) => ({ ...buddy })),
          ownName: 'Levi W.',
        }}
      >
        <TripList />
      </MileageSharingContext.Provider>
    )
  })
  return renderer!
}

const rows = (tree: ReactTestRenderer) =>
  (
    tree.root.findAll(
      (node) => node.type === ('ContextMenu' as never)
    ) as Found[]
  ).map((menu) => {
    const node = menu as unknown as ReactTestRenderer['root']
    const avatar = node.findAll((n) => n.type === ('Avatar' as never))[0]
    const texts = node
      .findAll((n) => n.type === ('Text' as never))
      .map((n) => n.props.children as unknown)
    return {
      label: menu.props.accessibilityLabel as string,
      avatar: avatar?.props as Record<string, unknown> | undefined,
      texts,
    }
  })

const rowFor = (tree: ReactTestRenderer, distance: string) =>
  rows(tree).find((row) =>
    row.label.match(new RegExp(`^\\w+ \\d+, \\d{4}, ${distance}(, |$)`))
  )!
const totalDraws = () => [...drawn.values()].reduce((a, b) => a + b, 0)

const updateCar = (spaceId: string, update: (car: SharedCar) => SharedCar) =>
  act(() => {
    useSharedCars.setState((state) => ({
      cars: { ...state.cars, [spaceId]: update(state.cars[spaceId]) },
    }))
  })

beforeEach(() => {
  const fixture = peopleFixture()
  useMileage.getState()._WARNING_forceDeleteMileage()
  useMileage.setState({
    vehicles: [fixture.vehicles[0]],
    trips: [fixture.trips.mine],
  })
  useSharedCars.setState(useSharedCars.getInitialState(), true)
  useSharedCars.setState({ cars: fixture.cars })
  drawn.clear()
  parentRenders = 0
  seen = []
  actions = undefined
  vi.mocked(Share.share).mockClear()
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

describe('a trip row', () => {
  it('names someone else who logged it, with their photo', () => {
    const tree = render(peopleFixture().buddies)
    const anas = rowFor(tree, '30 mi')
    expect(anas.label).toMatch(/, 30 mi, Logged by Annie$/)
    expect(anas.avatar).toMatchObject({
      name: 'Annie',
      avatar: { type: 'emoji', value: '🌻' },
      background: '#ff8800',
    })
    expect(anas.texts).toContain('Annie')

    expect(rowFor(tree, '40 mi').label).toMatch(/, Logged by Ben$/)
  })

  it('names no one on the User’s own trips, on their cars or a Shared Car', () => {
    const tree = render(peopleFixture().buddies)
    for (const distance of ['10 mi', '20 mi']) {
      const row = rowFor(tree, distance)
      expect(row.label).not.toContain('Logged by')
      expect(row.avatar).toBeUndefined()
    }
  })

  it('builds share text when it’s shared, saying who logged the trip', async () => {
    render(peopleFixture().buddies)
    const anas = peopleFixture().trips.vanAna
    await act(async () => actions!.share(anas))
    expect(vi.mocked(Share.share).mock.calls[0][0]).toEqual({
      message: 'Mar 2 · Family Minivan\nDistance: 30 mi\nLogged by: Annie',
    })
  })
})

describe('trip rows as Shared Cars sync', () => {
  it('draw nothing again for a sync’s bookkeeping', () => {
    const { buddies, VAN, MAZDA } = peopleFixture()
    const tree = render(buddies)
    const before = { parent: parentRenders, rows: totalDraws() }
    const people = seen.at(-1)!
    const annie = people.person(VAN, 'ana-van')
    expect(rows(tree)).toHaveLength(6)

    updateCar(VAN, (car) => ({ ...car, seq: 41, lastSyncedAt: 1234 }))
    updateCar(VAN, (car) => ({ ...car, pendingPuts: ['van-ana'] }))
    updateCar(MAZDA, (car) => ({ ...car, seq: 9, pendingPuts: [] }))

    expect(parentRenders).toBe(before.parent)
    expect(totalDraws()).toBe(before.rows)

    const cars = useSharedCars.getState().cars
    const again = buildMileagePeople(cars, buddies)
    expect(again).toBe(people)
    expect(again.person(VAN, 'ana-van')).toBe(annie)

    expect(
      buildMileagePeople(
        cars,
        buddies.map((buddy) => ({ ...buddy }))
      )
    ).toBe(people)
  })

  it('draw again when someone on a car changes', () => {
    const { buddies, VAN, MAZDA } = peopleFixture()
    const tree = render(buddies)
    const before = parentRenders
    const people = seen.at(-1)!

    const renamed = <T extends { memberId: string; name: string }>(m: T) =>
      m.memberId === 'ben' ? { ...m, name: 'Benjamin' } : m
    updateCar(VAN, (car) => ({
      ...car,
      members: car.members.map(renamed),
      memberRecords: car.memberRecords.map(renamed),
    }))

    expect(parentRenders).toBeGreaterThan(before)
    expect(seen.at(-1)).not.toBe(people)
    expect(rowFor(tree, '40 mi').label).toMatch(/, Logged by Benjamin$/)

    expect(seen.at(-1)!.person(MAZDA, 'ana-mazda')).toBe(
      people.person(MAZDA, 'ana-mazda')
    )
  })

  it('draw again for a trip someone added', () => {
    const { buddies, VAN } = peopleFixture()
    const tree = render(buddies)
    updateCar(VAN, (car) => ({
      ...car,
      trips: [
        ...car.trips,
        {
          id: 'van-ana-2',
          vehicleId: 'van',
          date: '2026-03-03',
          distanceMiles: 70,
          loggedBy: 'ana-van',
          createdAt: 2,
        },
      ],
    }))
    expect(rowFor(tree, '70 mi').label).toMatch(/, Logged by Annie$/)
  })
})
