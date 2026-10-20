import React from 'react'
import moment from 'moment'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  return { default: new I18n({ en }, { locale: 'en' }) }
})
vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('react-native-reanimated', () => ({
  default: { View: 'AnimatedView' },
  runOnJS: (fn: unknown) => fn,
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: number) => ({ value }),
}))
vi.mock('react-native-gesture-handler', () => {
  const gesture = (): Record<string, unknown> =>
    new Proxy({}, { get: (target, _key, proxy) => () => proxy })
  return {
    Gesture: { Pan: gesture, Hover: gesture, Simultaneous: gesture },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    PointerType: { STYLUS: 'stylus' },
  }
})
vi.mock('@/contexts/theme', () => {
  const theme = {
    colors: {
      accent: '#3366cc',
      border: '#dddddd',
      card: '#ffffff',
      text: '#000000',
      textAlt: '#666666',
    },
    fonts: {},
  }
  return { default: () => theme }
})
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/lib/haptics', () => ({ default: { selection: vi.fn() } }))
vi.mock('@/lib/pointerHover', () => ({
  notePointerHover: vi.fn(),
  supportsPointerHover: false,
}))
vi.mock('@/lib/dates', () => ({ formatDate: () => 'date' }))
vi.mock('@/lib/minutes', () => ({ formatMinutesCompact: () => '1h' }))

import ContributionGraph from '@/features/profile/components/ContributionGraph'

const daysAgo = (n: number) =>
  moment().startOf('day').subtract(n, 'days').format('YYYY-MM-DD')

const render = (daily: Map<string, number>) => {
  let renderer: ReactTestRenderer | undefined
  act(() => {
    renderer = create(<ContributionGraph daily={daily} />)
  })
  return renderer!.root
}

describe('ContributionGraph', () => {
  it('reads as one summary instead of its cells', () => {
    const root = render(
      new Map([
        [daysAgo(1), 60],
        [daysAgo(2), 30],
        [daysAgo(5), 90],
        [daysAgo(6), 0],
      ])
    )
    const graph = root.findByProps({ accessibilityRole: 'image' })
    expect(graph.props.accessible).toBe(true)
    expect(graph.props.accessibilityLabel).toBe(
      'Last 26 weeks: 3 days with service, longest run 2 days'
    )
    // Everything drawn inside, the cells included, is hidden behind it.
    const [content] = graph.children as (typeof graph)[]
    expect(content.props.importantForAccessibility).toBe('no-hide-descendants')
    expect(content.props.accessibilityElementsHidden).toBe(true)
    expect(
      root.findAll((node) => node.props.accessible === true && node !== graph, {
        deep: true,
      })
    ).toHaveLength(0)
  })

  it('says when nothing is logged', () => {
    const root = render(new Map())
    expect(
      root.findByProps({ accessibilityRole: 'image' }).props.accessibilityLabel
    ).toBe('Last 26 weeks: no service logged')
  })
})
