import React from 'react'
import moment from 'moment'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  return { default: new I18n({ en }, { locale: 'en' }) }
})
vi.mock('react-native', () => ({
  View: 'View',
  I18nManager: { isRTL: false },
}))
vi.mock('react-native-reanimated', () => ({
  default: { View: 'AnimatedView' },
  runOnJS: (fn: unknown) => fn,
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: number) => ({ value }),
}))
type ScrubEvent = { x: number; y: number; pointerType: string }
const pan = vi.hoisted(
  () => ({}) as Record<string, (event: ScrubEvent) => void>
)
vi.mock('react-native-gesture-handler', () => {
  const gesture = (handlers?: typeof pan) => (): Record<string, unknown> =>
    new Proxy(
      {},
      {
        get: (target, key, proxy) => (arg: unknown) => {
          if (handlers && typeof arg === 'function') {
            handlers[String(key)] = arg as (event: ScrubEvent) => void
          }
          return proxy
        },
      }
    )
  return {
    Gesture: {
      Pan: gesture(pan),
      Hover: gesture(),
      Simultaneous: gesture(),
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    PointerType: { TOUCH: 'touch', STYLUS: 'stylus', MOUSE: 'mouse' },
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
vi.mock('@/hooks/useAccessibilityTextSize', () => ({
  default: () => false,
  FIT_ONE_LINE: {},
}))
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

    const [content] = graph.children as (typeof graph)[]
    expect(content.props.importantForAccessibility).toBe('no-hide-descendants')
    expect(content.props.accessibilityElementsHidden).toBe(true)
    expect(
      root.findAll((node) => node.props.accessible === true && node !== graph, {
        deep: true,
      })
    ).toHaveLength(0)
  })

  describe('month labels', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    const layout = (width: number) => ({
      nativeEvent: { layout: { width, height: 14, x: 0, y: 0 } },
    })

    it('leaves out a month label that would overlap the next one', () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 9, 21, 12))
      const root = render(new Map())

      act(() => {
        root
          .findByProps({ accessibilityRole: 'image' })
          .props.onLayout(layout(26 + 26 * 14))
      })
      const labels = () =>
        root.findAll(
          (node) =>
            (node.type as unknown) === 'Text' &&
            typeof node.props.onLayout === 'function'
        )
      const shown = () =>
        labels()
          .filter((label) => label.props.style.opacity === 1)
          .map((label) => label.props.children)

      expect(shown()).toEqual([])
      act(() => {
        for (const label of labels()) label.props.onLayout(layout(20))
      })
      expect(shown()).toEqual(['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'])
    })
  })

  describe('scrub readout', () => {
    const readout = (root: ReturnType<typeof render>) =>
      root.find(
        (node) =>
          (node.type as unknown) === 'View' &&
          node.props.pointerEvents === 'none' &&
          node.props.style?.width === 150
      )
    const gridHeight = 7 * 8 + 6 * 3

    it('sits above the grid and its month labels under a finger, whatever the row', () => {
      const root = render(new Map())
      for (const y of [2, 30, 70]) {
        act(() => pan.onStart({ x: 2, y, pointerType: 'touch' }))
        const { style } = readout(root).props
        expect(style.bottom).toBe(gridHeight + 8 + 14 + 4)
        expect(style.top).toBeUndefined()
      }
    })

    it('stays beside the cell under a mouse pointer', () => {
      const root = render(new Map())
      act(() => pan.onStart({ x: 2, y: 2, pointerType: 'mouse' }))
      expect(readout(root).props.style.top).toBe(8 + 8)
      act(() => pan.onUpdate({ x: 2, y: 70, pointerType: 'mouse' }))
      expect(readout(root).props.style.bottom).toBe(gridHeight - 6 * 11 + 8)
    })
  })

  it('says when nothing is logged', () => {
    const root = render(new Map())
    expect(
      root.findByProps({ accessibilityRole: 'image' }).props.accessibilityLabel
    ).toBe('Last 26 weeks: no service logged')
  })
})
