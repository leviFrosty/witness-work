import React, { type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  showsTimeEntry: true,
  largeText: false,
  width: 402,
  scribe: { hidden: false, offline: false, open: vi.fn() },
  navigate: vi.fn(),
  capture: vi.fn(),
}))

vi.mock('react-native', () => ({
  View: 'View',
  useWindowDimensions: () => ({ width: runtime.width }),
}))
vi.mock('lucide-react-native', () => ({
  Calendar: 'Calendar',
  Clock: 'Clock',
  DoorOpen: 'DoorOpen',
  IdCard: 'IdCard',
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'contact-1' }))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: runtime.navigate }),
}))
vi.mock('@/components/ui/Card', () => ({ default: 'Card' }))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: () => null }))
vi.mock('@/components/HomeSectionMenu', () => ({
  default: ({ children }: { children?: ReactNode }) => children,
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: new Proxy({}, { get: () => '#000' }),
    fonts: new Proxy({}, { get: () => 'Font' }),
    fontSize: () => 14,
    numbers: { borderRadiusMd: 10, borderRadiusLg: 16 },
  }),
}))
vi.mock('@/hooks/useAccessibilityTextSize', () => ({
  default: () => runtime.largeText,
}))
vi.mock('@/hooks/usePublisher', () => ({
  default: () => ({ showsTimeEntry: runtime.showsTimeEntry }),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: runtime.capture } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/tracking', () => ({ tracking: (value: number) => value }))
vi.mock('@/features/scribe/components/openScribe', () => ({
  useOpenScribe: () => runtime.scribe,
}))
vi.mock('@/features/scribe/components/ScribeMicOrb', () => ({
  default: 'ScribeMicOrb',
}))
vi.mock('@/features/scribe/components/ScribeBadge', () => ({
  ScribeLabel: 'ScribeLabel',
}))

import ScribeQuickActionsCard from '@/features/scribe/components/ScribeQuickActionsCard'

const render = () => {
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(<ScribeQuickActionsCard />)
  })
  const buttons = () => renderer.root.findAllByType('Button' as never)
  const labels = () => buttons().map((node) => node.props.accessibilityLabel)
  const button = (label: string) =>
    buttons().find((node) => node.props.accessibilityLabel === label)!
  const orb = () => renderer.root.findAllByType('ScribeMicOrb' as never)[0]
  // The Views wrapping the tiles, which set their widths.
  const cellWidths = () =>
    renderer.root
      .findAll(
        (node) =>
          node.type === ('View' as never) &&
          typeof node.props.style?.width === 'string'
      )
      .map((node) => node.props.style.width)
  return { labels, button, orb, cellWidths }
}

describe('ScribeQuickActionsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtime.showsTimeEntry = true
    runtime.largeText = false
    runtime.width = 402
    runtime.scribe = { hidden: false, offline: false, open: vi.fn() }
  })

  it('offers Time, Contact and Plan, then the orb', () => {
    expect(render().labels()).toEqual([
      'addTime',
      'addContact',
      'createPlan',
      'scribe_orbLabel',
    ])
  })

  it('offers Visit in place of Time for publishers who don’t log time', () => {
    runtime.showsTimeEntry = false
    const { labels, button } = render()
    expect(labels().slice(0, 3)).toEqual([
      'logVisitAction',
      'addContact',
      'createPlan',
    ])
    act(() => button('logVisitAction').props.onPress())
    expect(runtime.navigate).toHaveBeenCalledWith('Log Visit')
    expect(runtime.capture).toHaveBeenCalledWith('quick_actions_tile_tapped', {
      tile: 'visit',
    })
  })

  it('opens each tile’s form and records the tap', () => {
    const { button } = render()
    act(() => button('addTime').props.onPress())
    expect(runtime.navigate).toHaveBeenLastCalledWith('Add Time')
    act(() => button('addContact').props.onPress())
    expect(runtime.navigate).toHaveBeenLastCalledWith('Contact Form', {
      id: 'contact-1',
    })
    act(() => button('createPlan').props.onPress())
    expect(runtime.navigate).toHaveBeenLastCalledWith('PlanDay', {})
    expect(runtime.capture.mock.calls.map(([, props]) => props.tile)).toEqual([
      'time',
      'contact',
      'plan',
    ])
  })

  it('opens Scribe AI from the orb', () => {
    const { button } = render()
    act(() => button('scribe_orbLabel').props.onPress())
    expect(runtime.scribe.open).toHaveBeenCalledWith('home_orb')
  })

  it('marks the orb offline', () => {
    runtime.scribe.offline = true
    const { labels, orb } = render()
    expect(labels()).toContain('scribe_orbOfflineLabel')
    expect(orb().props.offline).toBe(true)
  })

  it('gives each tile an equal third, whatever its label', () => {
    const third = `${100 / 3}%`
    expect(render().cellWidths()).toEqual([third, third, third])
  })

  it('stacks the tiles and the orb as rows at accessibility text sizes', () => {
    runtime.largeText = true
    const { labels, button, orb } = render()
    expect(labels()).toEqual([
      'addTime',
      'addContact',
      'createPlan',
      'scribe_orbLabel',
    ])
    expect(button('addTime').props.style).toContainEqual(
      expect.objectContaining({ flexDirection: 'row' })
    )
    expect(button('scribe_orbLabel').props.style).toMatchObject({
      flexDirection: 'row',
    })
    expect(orb().props.box).toBe(64)
    act(() => button('scribe_orbLabel').props.onPress())
    expect(runtime.scribe.open).toHaveBeenCalledWith('home_orb')
  })

  it('puts the orb under the tiles in a narrow window', () => {
    runtime.width = 320
    const { button, cellWidths } = render()
    const third = `${100 / 3}%`
    expect(cellWidths()).toEqual([third, third, third])
    expect(button('scribe_orbLabel').props.style).toMatchObject({
      flexDirection: 'row',
    })
  })

  it('shows only the tiles while Scribe AI is hidden', () => {
    runtime.scribe.hidden = true
    const { labels, orb } = render()
    expect(labels()).toEqual(['addTime', 'addContact', 'createPlan'])
    expect(orb()).toBeUndefined()
  })
})
