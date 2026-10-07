import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  capture: vi.fn(),
  hasAccess: true,
  stopCount: 2,
}))

vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mocks.navigate }),
}))
vi.mock('lucide-react-native', () => ({ ChevronRight: 'Icon', Route: 'Icon' }))
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
})

describe('TodayRouteEntry', () => {
  it('opens for non-Supporters too, marked as a Supporter feature', async () => {
    mocks.hasAccess = false
    const root = await render({ date: new Date(), surface: 'schedule_day' })
    expect(root.root.findAllByType('SupporterBadge' as never)).toHaveLength(1)
    await act(async () => {
      root.root.findByType('Button' as never).props.onPress()
    })
    expect(mocks.navigate).toHaveBeenCalledWith('TodayRoute')
    expect(mocks.capture).toHaveBeenCalledWith('route_plan_entry_opened', {
      surface: 'schedule_day',
      supporter: false,
    })
  })

  it('stays hidden on other days and with fewer than two stops', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    expect(
      (await render({ date: tomorrow, surface: 'schedule_day' })).toJSON()
    ).toBeNull()
    mocks.stopCount = 1
    expect(
      (await render({ date: new Date(), surface: 'schedule_day' })).toJSON()
    ).toBeNull()
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
    expect(mocks.navigate).toHaveBeenCalledWith('TodayRoute')
  })
})
