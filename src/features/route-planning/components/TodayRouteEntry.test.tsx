import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import moment from 'moment'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  capture: vi.fn(),
  hasAccess: true,
  stopCount: 2,
  routes: {} as Record<string, unknown>,
}))

vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mocks.navigate }),
}))
vi.mock('lucide-react-native', () => ({ Route: 'Icon' }))
vi.mock('@/components/ui/DirectionalIcon', () => ({
  ChevronForwardIcon: 'Icon',
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, fonts: {}, numbers: {}, fontSize: () => 14 }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/SupporterBadge', () => ({ default: 'SupporterBadge' }))
vi.mock('@/hooks/useFeatureAccess', () => ({
  default: () => ({ hasAccess: mocks.hasAccess }),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: mocks.capture } }))
vi.mock('@/features/route-planning/hooks/useDayRouteStops', () => ({
  default: () => ({
    stops: Array.from({ length: mocks.stopCount }, (_, i) => ({ key: `${i}` })),
    missingLocationCount: 0,
  }),
}))

vi.mock('@/stores/serviceReport', () => ({
  default: (select: (state: object) => unknown) =>
    select({ dayPlans: [], recurringPlans: [] }),
}))
// No Plans on the day, so none is the route's start.
vi.mock('@/features/route-planning/lib/routePlanOptions', () => ({
  routePlanOptions: () => [],
}))
vi.mock('@/features/route-planning/stores/savedRoutes', () => ({
  useSavedRoutes: (select: (state: { routes: unknown }) => unknown) =>
    select({ routes: mocks.routes }),
}))

import TodayRouteEntry from '@/features/route-planning/components/TodayRouteEntry'

const render = async (props: Parameters<typeof TodayRouteEntry>[0]) => {
  let root!: ReactTestRenderer
  await act(async () => {
    root = create(createElement(TodayRouteEntry, props))
  })
  return root
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.stopCount = 2
  mocks.hasAccess = true
  mocks.routes = {}
})

const subtitle = (root: ReactTestRenderer) =>
  root.root.findAllByType('Text' as never)[1]!.props.children

describe('TodayRouteEntry', () => {
  it('opens for non-Supporters too, marked as a Supporter feature', async () => {
    mocks.hasAccess = false
    const root = await render({ date: new Date(), surface: 'schedule_day' })
    expect(root.root.findAllByType('SupporterBadge' as never)).toHaveLength(1)
    await act(async () => {
      root.root.findByType('Button' as never).props.onPress()
    })
    expect(mocks.navigate).toHaveBeenCalledWith('TodayRoute', undefined)
    expect(mocks.capture).toHaveBeenCalledWith('route_plan_entry_opened', {
      surface: 'schedule_day',
      supporter: false,
      future_day: false,
    })
  })

  it('opens a day ahead on that day', async () => {
    const tomorrow = moment().add(1, 'day')
    const root = await render({
      date: tomorrow.toDate(),
      surface: 'schedule_day',
    })
    await act(async () => {
      root.root.findByType('Button' as never).props.onPress()
    })
    expect(mocks.navigate).toHaveBeenCalledWith('TodayRoute', {
      date: tomorrow.format('YYYY-MM-DD'),
    })
    expect(mocks.capture).toHaveBeenCalledWith(
      'route_plan_entry_opened',
      expect.objectContaining({ future_day: true })
    )
  })

  it('stays hidden on past days', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    expect(
      (await render({ date: yesterday, surface: 'schedule_day' })).toJSON()
    ).toBeNull()
  })

  it('offers a day with no stops, to plan from scratch', async () => {
    mocks.stopCount = 0
    const root = await render({ date: new Date(), surface: 'schedule_day' })
    expect(subtitle(root)).toBe('routeBuilder_entryEmpty')
  })

  it('counts the day stops ready to plan', async () => {
    mocks.stopCount = 1
    const root = await render({ date: new Date(), surface: 'schedule_day' })
    expect(subtitle(root)).toBe('routePlan_entrySubtitle')
  })

  it('says how many stops a route built for the day has', async () => {
    mocks.stopCount = 0
    mocks.routes = {
      [moment().format('YYYY-MM-DD')]: {
        day: moment().format('YYYY-MM-DD'),
        order: ['place:a'],
        removed: [],
        added: [
          {
            key: 'place:a',
            kind: 'place',
            title: 'Corner of Elm and 5th',
            coordinate: { latitude: 37.75, longitude: -122.42 },
            destination: '37.75,-122.42',
          },
        ],
        stay: {},
        updatedAt: 1,
      },
    }
    const root = await render({ date: new Date(), surface: 'schedule_day' })
    expect(subtitle(root)).toBe('routeBuilder_entryPlanned')
  })

  it('opens the route screen through the host, e.g. after its sheet closes', async () => {
    const onNavigate = vi.fn((go: () => void) => go())
    const root = await render({
      date: new Date(),
      surface: 'home_day',
      onNavigate,
    })
    await act(async () => {
      root.root.findByType('Button' as never).props.onPress()
    })
    expect(onNavigate).toHaveBeenCalledOnce()
    expect(mocks.navigate).toHaveBeenCalledWith('TodayRoute', undefined)
  })
})
