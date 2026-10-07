import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  hasAccess: false,
  focused: true,
  screen: 'PreferencesPersonalization',
  rootScreen: 'Schedule',
  appState: 'active',
  platform: 'ios',
  rect: { x: 12, y: 100, width: 300, height: 30 },
  nextId: 0,
  navigate: vi.fn(),
  capture: vi.fn(),
  measure: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  View: 'View',
  Modal: 'Modal',
  ScrollView: 'ScrollView',
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
  useWindowDimensions: () => ({ width: 400, height: 800 }),
  AppState: {
    get currentState() {
      return runtime.appState
    },
    addEventListener: () => ({ remove: runtime.removeListener }),
  },
}))
vi.mock('@react-navigation/native', async () => {
  const { createContext } = await import('react')
  return {
    NavigationRouteContext: createContext<{ name: string } | undefined>({
      get name() {
        return runtime.screen
      },
    }),
    NavigationContainerRefContext: createContext({
      getCurrentRoute: () => ({ name: runtime.rootScreen }),
    }),
    useIsFocused: () => runtime.focused,
    useNavigation: () => ({ navigate: runtime.navigate }),
  }
})
vi.mock('expo-crypto', () => ({ randomUUID: () => `flow-${++runtime.nextId}` }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: runtime.capture } }))
vi.mock('@/hooks/useFeatureAccess', () => ({
  default: () => ({ hasAccess: runtime.hasAccess }),
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: {},
    fonts: {},
    numbers: {},
    fontSize: () => 14,
  }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/hooks/useSheetBottomInset', () => ({ default: () => 0 }))
vi.mock('@/hooks/useCheapestSupporterPrice', () => ({
  default: () => ({ priceString: '$1' }),
}))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/IconButton', () => ({ default: 'IconButton' }))
vi.mock('@/components/SupporterBadge', () => ({ default: 'SupporterBadge' }))
vi.mock('@/components/SupporterBenefits', () => ({
  default: 'SupporterBenefits',
}))
vi.mock('lucide-react-native', () => ({ X: 'X' }))
vi.mock('tamagui', async () => {
  const { createElement } = await import('react')
  const Sheet = ({ children, ...props }: { children?: React.ReactNode }) =>
    createElement('Sheet', props, children)
  return {
    Sheet: Object.assign(Sheet, {
      Handle: 'SheetHandle',
      Overlay: 'SheetOverlay',
      Frame: 'SheetFrame',
    }),
  }
})

import IsSupporter from '@/components/IsSupporter'
import { VisibilityViewportContext } from '@/contexts/visibilityViewport'
import { Pressable } from 'react-native'
import { NavigationRouteContext } from '@react-navigation/native'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'

let renderer: ReactTestRenderer | undefined
const gate = () => (
  <IsSupporter analyticsSurface='accent_color' feature='customAccentColor'>
    <React.Fragment>Palette</React.Fragment>
  </IsSupporter>
)
const events = (name: string) =>
  runtime.capture.mock.calls.filter(([event]) => event === name)
const render = (
  viewport?: React.ContextType<typeof VisibilityViewportContext>
) => {
  act(() => {
    renderer = create(
      viewport ? (
        <VisibilityViewportContext value={viewport}>
          {gate()}
        </VisibilityViewportContext>
      ) : (
        gate()
      ),
      {
        createNodeMock: () => ({
          measureInWindow: runtime.measure,
        }),
      }
    )
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) =>
    setTimeout(callback, 0)
  )
  runtime.hasAccess = false
  runtime.focused = true
  runtime.screen = 'PreferencesPersonalization'
  runtime.appState = 'active'
  runtime.platform = 'ios'
  runtime.rect = { x: 12, y: 100, width: 300, height: 30 }
  runtime.nextId = 0
  runtime.measure.mockImplementation((callback) => {
    const { x, y, width, height } = runtime.rect
    callback(x, y, width, height)
  })
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe.each(['ios', 'android'])('supporter gate on %s', (platform) => {
  it('counts actual visibility once, then carries the same origin through the sheet and paywall', () => {
    runtime.platform = platform
    render()
    const attribution = {
      feature: 'customAccentColor',
      source_screen: 'PreferencesPersonalization',
      gate_surface: 'accent_color',
      gate_placement:
        'customAccentColor / PreferencesPersonalization / accent_color',
      gate_flow_id: 'flow-1',
    }
    expect(events('supporter_feature_gate_viewed')).toEqual([
      ['supporter_feature_gate_viewed', attribution],
    ])
    act(() => renderer!.update(gate()))
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(events('supporter_feature_gate_viewed')).toHaveLength(1)
    expect(runtime.measure).toHaveBeenCalledTimes(1)

    act(() => renderer!.root.findByType(Pressable).props.onPress())
    expect(events('supporter_feature_gate_clicked')[0][1]).toEqual(attribution)
    expect(events('supporter_gate_viewed')[0][1]).toEqual(attribution)
    const cta = renderer!.root.findAllByType(Button)[0]
    act(() => {
      cta.props.onPress()
      cta.props.onPress()
      vi.advanceTimersByTime(0)
    })
    expect(events('supporter_gate_clicked')).toHaveLength(1)
    expect(events('paywall_opened')).toEqual([])
    expect(runtime.navigate).toHaveBeenCalledExactlyOnceWith('Paywall', {
      source: 'feature_gate',
      feature: 'customAccentColor',
      gateAttribution: attribution,
    })
    expect(events('supporter_gate_dismissed')).toHaveLength(0)
  })
})

it('attributes a gate outside any screen, like a portaled sheet, to the current screen', () => {
  act(() => {
    renderer = create(
      <NavigationRouteContext value={undefined}>
        {gate()}
      </NavigationRouteContext>,
      { createNodeMock: () => ({ measureInWindow: runtime.measure }) }
    )
  })
  expect(events('supporter_feature_gate_viewed')[0][1]).toMatchObject({
    source_screen: 'Schedule',
  })
})

it('does not count an offscreen gate until its header scrolls into view', () => {
  runtime.rect.y = 850
  render()
  act(() => {
    vi.advanceTimersByTime(500)
  })
  expect(events('supporter_feature_gate_viewed')).toHaveLength(0)
  runtime.rect.y = 790 // Less than half of the header is visible.
  act(() => {
    vi.advanceTimersByTime(500)
  })
  expect(events('supporter_feature_gate_viewed')).toHaveLength(0)
  runtime.rect.y = 770
  act(() => {
    vi.advanceTimersByTime(500)
  })
  expect(events('supporter_feature_gate_viewed')).toHaveLength(1)
})

it('does not count a header inside the window but clipped above or below its scroll viewport', () => {
  const viewport = {
    current: {
      measureInWindow: (
        callback: (x: number, y: number, w: number, h: number) => void
      ) => callback(0, 140, 400, 600),
    },
  }
  runtime.rect.y = 90
  render(viewport)
  expect(events('supporter_feature_gate_viewed')).toHaveLength(0)
  runtime.rect.y = 750
  act(() => {
    vi.advanceTimersByTime(500)
  })
  expect(events('supporter_feature_gate_viewed')).toHaveLength(0)
  runtime.rect.y = 200
  act(() => {
    vi.advanceTimersByTime(500)
  })
  expect(events('supporter_feature_gate_viewed')).toHaveLength(1)
})

it('does not count allowed, unfocused, or background gates', () => {
  runtime.hasAccess = true
  render()
  act(() => {
    vi.advanceTimersByTime(500)
  })
  expect(runtime.capture).not.toHaveBeenCalled()
  runtime.hasAccess = false
  runtime.focused = false
  act(() => renderer!.update(gate()))
  act(() => {
    vi.advanceTimersByTime(500)
  })
  expect(runtime.capture).not.toHaveBeenCalled()
  runtime.focused = true
  runtime.appState = 'background'
  act(() => renderer!.update(gate()))
  act(() => {
    vi.advanceTimersByTime(500)
  })
  expect(runtime.capture).not.toHaveBeenCalled()
  runtime.appState = 'active'
  act(() => {
    vi.advanceTimersByTime(500)
  })
  expect(events('supporter_feature_gate_viewed')).toHaveLength(1)
})

it('starts a new visible visit when returning to the screen', () => {
  render()
  runtime.focused = false
  act(() => renderer!.update(gate()))
  runtime.focused = true
  act(() => renderer!.update(gate()))
  expect(
    events('supporter_feature_gate_viewed').map(
      ([, props]) => props.gate_flow_id
    )
  ).toEqual(['flow-1', 'flow-2'])
})

it('records visibility before a fast tap and attributes dismissal without opening the paywall', () => {
  runtime.measure.mockImplementation(() => {})
  render()
  act(() => renderer!.root.findByType(Pressable).props.onPress())
  expect(runtime.capture.mock.calls.map(([name]) => name)).toEqual([
    'supporter_feature_gate_viewed',
    'supporter_feature_gate_clicked',
    'supporter_gate_viewed',
  ])
  act(() => renderer!.root.findByType(IconButton).props.onPress())
  expect(events('supporter_gate_dismissed')[0][1]).toMatchObject({
    gate_flow_id: 'flow-1',
    source_screen: 'PreferencesPersonalization',
    method: 'close_button',
  })
  expect(runtime.navigate).not.toHaveBeenCalled()
})

it('ignores a measurement that resolves after the screen loses focus', () => {
  let complete:
    | ((x: number, y: number, width: number, height: number) => void)
    | undefined
  runtime.measure.mockImplementation((callback) => {
    complete = callback
  })
  render()
  runtime.focused = false
  act(() => renderer!.update(gate()))
  act(() => complete?.(12, 100, 300, 30))
  expect(runtime.capture).not.toHaveBeenCalled()
  expect(runtime.removeListener).toHaveBeenCalled()
})
