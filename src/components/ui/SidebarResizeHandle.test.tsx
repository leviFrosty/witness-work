import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type PanEvent = { translationX: number }
const runtime = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  write: vi.fn(),
  capture: vi.fn(),
  pan: {
    start: () => {},
    update: (_event: PanEvent) => {},
    end: (_event: PanEvent, _success: boolean) => {},
    finalize: () => {},
  },
}))

vi.mock('react-native', () => ({
  StyleSheet: { absoluteFill: {} },
  View: 'View',
}))
vi.mock('../../../modules/pointer-style', () => ({
  default: 'PointerStyleView',
}))
vi.mock('react-native-reanimated', async () => {
  const { useRef } = await import('react')
  return {
    default: { View: 'AnimatedView' },
    Extrapolation: { CLAMP: 'clamp' },
    interpolate: () => 0,
    interpolateColor: () => '#000',
    useAnimatedStyle: () => ({}),
    useDerivedValue: () => ({ value: 0 }),
    useSharedValue: <T,>(value: T) => useRef({ value }).current,
    withTiming: <T,>(value: T) => value,
  }
})
vi.mock('react-native-worklets', () => ({
  scheduleOnRN: <A extends unknown[]>(fn: (...args: A) => void, ...args: A) =>
    fn(...args),
}))
vi.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  Gesture: {
    Simultaneous: () => ({}),
    Hover: () => {
      const builder = {
        onBegin: () => builder,
        onFinalize: () => builder,
      }
      return builder
    },
    Pan: () => {
      const builder = {
        activeOffsetX: () => builder,
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
    setItem: (key: string, value: string) => {
      runtime.write(key, value)
      runtime.storage.set(key, value)
    },
    removeItem: (key: string) => runtime.storage.delete(key),
  },
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: { accent: '#00f', textAlt: '#666' } }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: runtime.capture } }))

import SidebarResizeHandle from '@/components/ui/SidebarResizeHandle'
import { useSidebarPreferences, useSidebarResize } from '@/stores/sidebar'
import type { SharedValue } from 'react-native-reanimated'

describe('sidebar resizing and saved position', () => {
  let renderer: ReactTestRenderer | undefined

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    useSidebarPreferences.setState({ width: 240, hidden: false })
    useSidebarResize.getState().preview(null)
    runtime.capture.mockClear()
    runtime.write.mockClear()
  })

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = undefined
  })

  let liveWidth: { value: number }
  const renderHandle = () => {
    liveWidth = { value: 240 }
    act(() => {
      renderer = create(
        <SidebarResizeHandle
          width={240}
          liveWidth={liveWidth as SharedValue<number>}
        />
      )
    })
  }

  it('previews a drag without writing storage and saves the width once on release', () => {
    renderHandle()
    act(() => runtime.pan.start())
    act(() => runtime.pan.update({ translationX: -10 }))
    expect(liveWidth.value).toBe(230)
    expect(useSidebarResize.getState().compact).toBeNull()
    act(() => runtime.pan.update({ translationX: -152 }))
    expect(liveWidth.value).toBe(88)
    expect(useSidebarResize.getState().compact).toBe(true)
    expect(useSidebarPreferences.getState().width).toBe(240)
    expect(runtime.write).not.toHaveBeenCalled()

    act(() => {
      runtime.pan.end({ translationX: -152 }, true)
      runtime.pan.finalize()
    })
    expect(useSidebarPreferences.getState().width).toBe(88)
    expect(useSidebarResize.getState().compact).toBeNull()
    expect(runtime.write).toHaveBeenCalledTimes(1)
    expect(runtime.capture).not.toHaveBeenCalled()
    expect(runtime.capture).not.toHaveBeenCalledWith('sidebar_resize_cancelled')
  })

  it('reverts an interrupted gesture to the saved width', () => {
    renderHandle()
    act(() => {
      runtime.pan.start()
      runtime.pan.update({ translationX: -120 })
      runtime.pan.end({ translationX: -120 }, false)
      runtime.pan.finalize()
    })
    expect(useSidebarPreferences.getState().width).toBe(240)
    expect(liveWidth.value).toBe(240)
    expect(useSidebarResize.getState().compact).toBeNull()
    expect(runtime.write).not.toHaveBeenCalled()
    expect(runtime.capture).not.toHaveBeenCalled()
  })

  it('cleans up a live preview if the tablet layout disappears mid-drag', () => {
    renderHandle()
    act(() => {
      runtime.pan.start()
      runtime.pan.update({ translationX: 120 })
    })
    act(() => renderer?.unmount())
    renderer = undefined
    expect(liveWidth.value).toBe(240)
    expect(useSidebarResize.getState().compact).toBeNull()
    expect(useSidebarPreferences.getState().width).toBe(240)
    expect(runtime.capture).not.toHaveBeenCalled()
  })

  it('ignores gesture frames delivered after the handle has unmounted', () => {
    renderHandle()
    act(() => {
      runtime.pan.start()
      runtime.pan.update({ translationX: -100 })
    })
    const lateUpdate = runtime.pan.update
    const lateEnd = runtime.pan.end
    act(() => renderer?.unmount())
    renderer = undefined
    act(() => {
      lateUpdate({ translationX: -152 })
      lateEnd({ translationX: -152 }, true)
    })
    expect(useSidebarResize.getState().compact).toBeNull()
    expect(useSidebarPreferences.getState().width).toBe(240)
    expect(runtime.write).not.toHaveBeenCalled()
  })

  it('saves the final pointer position even if the last update frame was skipped', () => {
    renderHandle()
    act(() => {
      runtime.pan.start()
      runtime.pan.update({ translationX: -120 })
      runtime.pan.end({ translationX: -152 }, true)
      runtime.pan.finalize()
    })
    expect(useSidebarPreferences.getState().width).toBe(88)
  })

  it('restores the saved icon-only width and hidden state after hydration', async () => {
    useSidebarPreferences.getState().setWidth(112)
    useSidebarPreferences.getState().toggle()
    const saved = runtime.storage.get('sidebar-layout')!
    expect(JSON.parse(saved).state).toEqual({ width: 112, hidden: true })
    useSidebarPreferences.setState({ width: 240, hidden: false })
    runtime.storage.set('sidebar-layout', saved)
    await useSidebarPreferences.persist.rehydrate()
    expect(useSidebarPreferences.getState()).toMatchObject({
      width: 112,
      hidden: true,
    })
    useSidebarPreferences.getState().toggle()
    expect(useSidebarPreferences.getState()).toMatchObject({
      width: 112,
      hidden: false,
    })
  })

  it('lets a screen reader resize the sidebar without a drag', () => {
    renderHandle()
    const control = renderer!.root.findAllByType('View' as React.ElementType)[0]
    act(() =>
      control.props.onAccessibilityAction({
        nativeEvent: { actionName: 'decrement' },
      })
    )
    expect(useSidebarPreferences.getState().width).toBe(216)
    expect(runtime.capture).not.toHaveBeenCalled()
  })
})
