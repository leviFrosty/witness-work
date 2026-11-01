import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type PanEvent = { translationY: number; velocityY: number }
type KeyboardHandler = (event: { endCoordinates: { height: number } }) => void
const runtime = vi.hoisted(() => ({
  os: 'ios' as 'ios' | 'android',
  storage: new Map<string, string>(),
  keyboard: new Map<string, (event: unknown) => void>(),
  back: null as (() => boolean) | null,

  deferTimings: false,
  timingsDone: [] as ((finished: boolean) => void)[],
  pan: {
    start: () => {},
    update: (_event: PanEvent) => {},
    end: (_event: PanEvent) => {},
    finalize: () => {},
  },
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.os
    },
  },
  StyleSheet: { absoluteFill: {}, hairlineWidth: 1 },
  View: 'View',
  useWindowDimensions: () => ({ width: 400, height: 1000 }),
  Keyboard: {
    addListener: (name: string, handler: (event: unknown) => void) => {
      runtime.keyboard.set(name, handler)
      return { remove: () => runtime.keyboard.delete(name) }
    },
  },
  BackHandler: {
    addEventListener: (_name: string, handler: () => boolean) => {
      runtime.back = handler
      return { remove: () => (runtime.back = null) }
    },
  },
}))
vi.mock('tamagui', () => ({
  Portal: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('../../../modules/pointer-style', () => ({
  default: 'PointerStyleView',
}))
vi.mock('react-native-reanimated', async () => {
  const { useRef } = await import('react')
  return {
    default: { View: 'AnimatedView' },
    Easing: { bezier: () => () => 0 },

    useAnimatedStyle: (updater: () => Record<string, unknown>) =>
      new Proxy({}, { get: (_target, key: string) => updater()[key] }),
    useSharedValue: <T,>(value: T) => useRef({ value }).current,
    withTiming: <T,>(
      value: T,
      _config?: unknown,
      done?: (finished: boolean) => void
    ) => {
      if (done && runtime.deferTimings) runtime.timingsDone.push(done)
      else done?.(true)
      return value
    },
  }
})
vi.mock('react-native-worklets', () => ({
  scheduleOnRN: <A extends unknown[]>(fn: (...args: A) => void, ...args: A) =>
    fn(...args),
}))
vi.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  Gesture: {
    Pan: () => {
      const builder = {
        activeOffsetY: () => builder,
        onStart: (handler: typeof runtime.pan.start) => {
          runtime.pan.start = handler
          return builder
        },
        onUpdate: (handler: typeof runtime.pan.update) => {
          runtime.pan.update = handler
          return builder
        },
        onEnd: (handler: typeof runtime.pan.end) => {
          runtime.pan.end = handler
          return builder
        },
        onFinalize: (handler: typeof runtime.pan.finalize) => {
          runtime.pan.finalize = handler
          return builder
        },
      }
      return builder
    },
  },
}))
vi.mock('@/stores/mmkv', () => ({
  MmkvStorage: {
    getItem: (key: string) => runtime.storage.get(key) ?? null,
    setItem: (key: string, value: string) => runtime.storage.set(key, value),
    removeItem: (key: string) => runtime.storage.delete(key),
  },
}))
vi.mock('@/hooks/useTakeoverTurn', () => ({ useTakeoverHold: () => {} }))
vi.mock('@/hooks/useAdaptiveLayout', () => ({
  default: () => ({ sidebarWidth: 0 }),
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: { backgroundLighter: '#fff', border: '#ddd', textAlt: '#666' },
  }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import SplitSheet from '@/components/ui/SplitSheet'
import { useSplitSheetPreferences } from '@/stores/splitSheet'

describe('split sheet', () => {
  let renderer: ReactTestRenderer | undefined
  const onOpenChange = vi.fn()
  const onHeightChange = vi.fn()

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    runtime.os = 'ios'
    runtime.keyboard.clear()
    runtime.back = null
    runtime.deferTimings = false
    runtime.timingsDone = []
    useSplitSheetPreferences.setState({ ratio: 0.5 })
    onOpenChange.mockClear()
    onHeightChange.mockClear()
  })

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = undefined
  })

  const render = (props: { open?: boolean; onBackPress?: () => void } = {}) => {
    const element = (open: boolean, hidden = false) => (
      <SplitSheet
        open={open}
        hidden={hidden}
        onOpenChange={onOpenChange}
        onHeightChange={onHeightChange}
        onBackPress={props.onBackPress}
      >
        {'content' as unknown as React.ReactElement}
      </SplitSheet>
    )
    act(() => {
      renderer = create(element(props.open ?? true))
    })
    return {
      setOpen: (open: boolean) => act(() => renderer!.update(element(open))),
      setHidden: (hidden: boolean) =>
        act(() => renderer!.update(element(true, hidden))),
    }
  }

  const sheetStyle = () =>
    renderer!.root.findByType('AnimatedView' as React.ElementType).props
      .style[1] as { height: number; transform: { translateY: number }[] }

  const drag = (translationY: number, velocityY = 0) =>
    act(() => {
      const event = { translationY, velocityY }
      runtime.pan.start()
      runtime.pan.update(event)
      runtime.pan.end(event)
      runtime.pan.finalize()
    })

  it('opens at its saved size and tells the screen above how much it covers', () => {
    const { setOpen } = render()
    expect(sheetStyle().height).toBe(500)
    expect(onHeightChange).toHaveBeenLastCalledWith(500)
    setOpen(false)
    expect(onHeightChange).toHaveBeenLastCalledWith(0)

    expect(renderer!.toJSON()).toBeNull()
  })

  it('stays open when it opens just as it mounts, before its first close animation ends', () => {
    runtime.deferTimings = true
    const { setOpen } = render({ open: false })
    setOpen(true)
    act(() => runtime.timingsDone.forEach((done) => done(true)))
    expect(
      renderer!.root.findAllByType('AnimatedView' as React.ElementType)
    ).toHaveLength(1)
  })

  it('steps aside for another screen, keeping its content for when it comes back', () => {
    runtime.os = 'android'
    const { setHidden } = render()
    setHidden(true)

    expect(sheetStyle().transform[0].translateY).toBe(524)
    expect(JSON.stringify(renderer!.toJSON())).toContain('content')
    expect(onHeightChange).toHaveBeenLastCalledWith(0)

    expect(runtime.back).toBeNull()

    setHidden(false)
    expect(sheetStyle().transform[0].translateY).toBe(0)
    expect(onHeightChange).toHaveBeenLastCalledWith(500)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('resizes with a drag and keeps the size for next time', () => {
    render()
    drag(-100)
    expect(sheetStyle().height).toBe(600)
    expect(useSplitSheetPreferences.getState().ratio).toBe(0.6)
    expect(onHeightChange).toHaveBeenLastCalledWith(600)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('stops at its largest and smallest sizes', () => {
    render()
    act(() => {
      runtime.pan.start()
      runtime.pan.update({ translationY: -300, velocityY: 0 })
    })

    expect(sheetStyle().height).toBe(680)
    act(() => {
      runtime.pan.end({ translationY: -300, velocityY: 0 })
      runtime.pan.finalize()
    })
    expect(sheetStyle().height).toBe(650)
    expect(useSplitSheetPreferences.getState().ratio).toBe(0.65)

    drag(400)
    expect(sheetStyle().height).toBe(300)
    expect(sheetStyle().transform[0].translateY).toBe(0)
    expect(useSplitSheetPreferences.getState().ratio).toBe(0.3)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('closes when pulled well below its smallest size, keeping its size', () => {
    render()
    act(() => {
      runtime.pan.start()
      runtime.pan.update({ translationY: 300, velocityY: 0 })
    })

    expect(sheetStyle().height).toBe(300)
    expect(sheetStyle().transform[0].translateY).toBe(100)
    act(() => {
      runtime.pan.end({ translationY: 300, velocityY: 0 })
      runtime.pan.finalize()
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(useSplitSheetPreferences.getState().ratio).toBe(0.5)
  })

  it('closes on a fast fling toward its smallest size', () => {
    render()
    drag(150, 1000)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('reopens at its saved size after being dragged closed', () => {
    const { setOpen } = render()
    drag(300)
    setOpen(false)
    setOpen(true)
    expect(sheetStyle().height).toBe(500)
    expect(sheetStyle().transform[0].translateY).toBe(0)
  })

  it('grows while a full keyboard is up, but not for a hardware keyboard bar', () => {
    render()
    const show = (height: number) =>
      act(() =>
        (runtime.keyboard.get('keyboardWillShow') as KeyboardHandler)({
          endCoordinates: { height },
        })
      )
    show(60)
    expect(sheetStyle().height).toBe(500)
    show(336)
    expect(sheetStyle().height).toBe(850)
    act(() => runtime.keyboard.get('keyboardWillHide')!({}))
    expect(sheetStyle().height).toBe(500)

    expect(useSplitSheetPreferences.getState().ratio).toBe(0.5)
  })

  it("hands Android's back button to the sheet's content, or closes", () => {
    runtime.os = 'android'
    const onBackPress = vi.fn()
    render({ onBackPress })
    act(() => {
      runtime.back!()
    })
    expect(onBackPress).toHaveBeenCalledTimes(1)
    expect(onOpenChange).not.toHaveBeenCalled()

    act(() => renderer?.unmount())
    render()
    act(() => {
      runtime.back!()
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('lets a screen reader resize the sheet without a drag', () => {
    render()
    const control = renderer!.root.find(
      (node) => node.props.accessibilityRole === 'adjustable'
    )
    act(() =>
      control.props.onAccessibilityAction({
        nativeEvent: { actionName: 'increment' },
      })
    )
    expect(useSplitSheetPreferences.getState().ratio).toBeCloseTo(0.6)
    expect(sheetStyle().height).toBeCloseTo(600)
  })
})
