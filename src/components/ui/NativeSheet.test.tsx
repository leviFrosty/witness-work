import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeSheetProps } from '@/components/ui/Sheet.types'

const runtime = vi.hoisted(() => ({
  isPad: false,
  window: { width: 400, height: 800 },
  sides: { left: 0, right: 0 },
  hide: vi.fn(),
  keyboard: {} as Record<string, (event: unknown) => void>,
  keyboardMetrics: undefined as { screenY: number } | undefined,
}))

vi.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    get isPad() {
      return runtime.isPad
    },
  },
  Keyboard: {
    metrics: () => runtime.keyboardMetrics,
    addListener: (name: string, listener: (event: unknown) => void) => {
      runtime.keyboard[name] = listener
      return { remove: () => delete runtime.keyboard[name] }
    },
  },
  useWindowDimensions: () => runtime.window,
  View: 'View',
}))
vi.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: 'GestureHandlerRootView',
}))
vi.mock('react-native-safe-area-context', async () => {
  const { createContext, useContext } = await import('react')
  const SafeAreaInsetsContext = createContext<object | null>(null)
  return {
    SafeAreaInsetsContext,
    useSafeAreaInsets: () =>
      useContext(SafeAreaInsetsContext) ?? {
        top: 50,
        bottom: 30,
        ...runtime.sides,
      },
  }
})
vi.mock('@/lib/direction', () => ({ isRtlLayout: () => false }))
vi.mock('@expo/ui', () => ({ Host: 'Host' }))
vi.mock('@expo/ui/swift-ui', () => ({
  BottomSheet: 'BottomSheet',
  Group: 'Group',
  RNHostView: 'RNHostView',
}))
vi.mock('@expo/ui/swift-ui/modifiers', () => {
  const modifier =
    (name: string) =>
    (...args: unknown[]) => ({ [name]: args.length > 1 ? args : args[0] })
  return {
    interactiveDismissDisabled: modifier('interactiveDismissDisabled'),
    onGeometryChange: (handler: unknown) => ({ onGeometryChange: handler }),
    presentationBackground: modifier('presentationBackground'),
    presentationDetents: modifier('presentationDetents'),
    presentationDragIndicator: modifier('presentationDragIndicator'),
    presentationSizing: modifier('presentationSizing'),
  }
})
vi.mock('@expo/ui/jetpack-compose', async () => {
  const { createElement, useImperativeHandle } = await import('react')
  const ModalBottomSheet = ({
    ref,
    children,
    ...props
  }: React.PropsWithChildren<{ ref: React.Ref<unknown> }>) => {
    useImperativeHandle(ref, () => ({ hide: runtime.hide }))
    return createElement('ModalBottomSheet', props, children)
  }
  ModalBottomSheet.DragHandle = 'DragHandle'
  return {
    Box: 'Box',
    Column: 'Column',
    RNHostView: 'RNHostView',
    ModalBottomSheet,
  }
})
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  background: (color: string) => ({ background: color }),
  clip: (shape: unknown) => ({ clip: shape }),
  fillMaxSize: () => ({ fillMaxSize: true }),
  onGloballyPositioned: (handler: unknown) => ({
    onGloballyPositioned: handler,
  }),
  padding: (...edges: number[]) => ({ padding: edges }),
  Shapes: { RoundedCorner: (radius: number) => ({ roundedCorner: radius }) },
  size: (width: number, height: number) => ({ size: [width, height] }),
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: { textAlt: '#999' } }),
}))

import IOSNativeSheet from '@/components/ui/NativeSheet.ios'
import AndroidNativeSheet from '@/components/ui/NativeSheet.android'
import { useToWindow } from '@/components/ui/sheetWindowFrame'
import HorizontalSafeArea from '@/components/ui/layout/HorizontalSafeArea'

/** Reports where a 10×10 view at (20, 40) in the sheet lands in the window. */
const Probe = () => {
  const toWindow = useToWindow()
  return React.createElement('probe', {
    rect: toWindow({ x: 20, y: 40, width: 10, height: 10 }),
  })
}

let root: ReactTestRenderer
const onDismiss = vi.fn()
const onClosed = vi.fn()

const render = (
  NativeSheet: typeof IOSNativeSheet,
  props: Partial<NativeSheetProps> = {}
) =>
  act(() => {
    const element = (
      <NativeSheet
        open
        onDismiss={onDismiss}
        onClosed={onClosed}
        dismissible
        backgroundColor='#fff'
        {...props}
      >
        <Probe />
      </NativeSheet>
    )
    if (root) root.update(element)
    else root = create(element)
  })

const find = (type: string) => root.root.findByType(type as never)
const content = () => find('GestureHandlerRootView').props.style
const probe = () => find('probe').props.rect

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  runtime.isPad = false
  runtime.window = { width: 400, height: 800 }
  runtime.sides = { left: 0, right: 0 }
  runtime.hide.mockResolvedValue(undefined)
  runtime.keyboard = {}
  runtime.keyboardMetrics = undefined
})

afterEach(() => {
  act(() => root.unmount())
  root = undefined as never
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('iOS native sheet', () => {
  it('fits its content to the window width, or a form sheet on iPad', () => {
    render(IOSNativeSheet)
    expect(find('BottomSheet').props.fitToContents).toBe(true)
    expect(find('Group').props.modifiers).toEqual([
      { presentationDragIndicator: 'visible' },
      { interactiveDismissDisabled: false },
      { presentationBackground: '#fff' },
      { presentationSizing: 'fitted' },
      { onGeometryChange: expect.any(Function) },
    ])
    expect(find('RNHostView').props.matchContents).toBe(true)
    expect(content()[1]).toEqual({ width: 400, maxHeight: 696 })

    act(() => root.unmount())
    root = undefined as never
    runtime.isPad = true
    runtime.window = { width: 1024, height: 768 }
    render(IOSNativeSheet)
    expect(content()[1].width).toBe(540)
  })

  it("keeps content that fits clear of iPhone Duo's vertical bar", () => {
    runtime.window = { width: 466, height: 678 }
    runtime.sides = { left: 0, right: 84 }
    render(IOSNativeSheet)
    expect(content()[1].width).toBe(382)

    // Inside a screen the insets no longer show the bar; the sheet still
    // clears it.
    act(() => root.unmount())
    act(() => {
      root = create(
        <HorizontalSafeArea covered='right'>
          <IOSNativeSheet
            open
            onDismiss={onDismiss}
            onClosed={onClosed}
            dismissible
            backgroundColor='#fff'
          >
            <Probe />
          </IOSNativeSheet>
        </HorizontalSafeArea>
      )
    })
    expect(content()[1].width).toBe(382)
  })

  it('rests at its snap points and fills the sheet', () => {
    render(IOSNativeSheet, { snapPoints: ['half', 'full', { fraction: 0.3 }] })
    expect(find('BottomSheet').props.fitToContents).toBe(false)
    expect(find('Group').props.modifiers).toEqual(
      expect.arrayContaining([
        { presentationDetents: ['medium', 'large', { fraction: 0.3 }] },
        { presentationSizing: 'page' },
      ])
    )
    expect(find('RNHostView').props.matchContents).toBe(false)
    expect(content()[1]).toEqual({ flex: 1 })
  })

  it('keeps content that fits above the keyboard', () => {
    runtime.keyboardMetrics = { screenY: 500 }
    render(IOSNativeSheet)
    // 800 tall, 50 top inset, 24 gap, 300 of keyboard
    expect(content()[1].maxHeight).toBe(426)

    act(() => runtime.keyboard.keyboardWillHide({}))
    expect(content()[1].maxHeight).toBe(696)
    act(() =>
      runtime.keyboard.keyboardWillChangeFrame({
        endCoordinates: { screenY: 600 },
      })
    )
    expect(content()[1].maxHeight).toBe(526)
  })

  it('places popovers against where the sheet draws its content', () => {
    render(IOSNativeSheet)
    expect(probe()).toEqual({ x: 20, y: 40, width: 10, height: 10 })

    act(() =>
      find('GestureHandlerRootView').props.onLayout({
        nativeEvent: { layout: { width: 400 } },
      })
    )
    const geometry = find('Group').props.modifiers.find(
      (modifier: object) => 'onGeometryChange' in modifier
    ).onGeometryChange
    // iOS 26 draws a short sheet at 0.96 scale, 8pt in from each side.
    act(() => geometry({ x: 8, y: 500, width: 384, height: 200 }))
    expect(probe()).toEqual({
      x: 8 + 20 * 0.96,
      y: 500 + 40 * 0.96,
      width: 9.6,
      height: 9.6,
    })
  })

  it('reports a dismissal, then the end of the close', () => {
    render(IOSNativeSheet, { dismissible: false })
    expect(find('Group').props.modifiers).toEqual(
      expect.arrayContaining([
        { presentationDragIndicator: 'hidden' },
        { interactiveDismissDisabled: true },
      ])
    )
    find('BottomSheet').props.onIsPresentedChange(true)
    expect(onDismiss).not.toHaveBeenCalled()
    find('BottomSheet').props.onIsPresentedChange(false)
    expect(onDismiss).toHaveBeenCalledOnce()
    find('BottomSheet').props.onDismiss()
    expect(onClosed).toHaveBeenCalledOnce()
  })
})

describe('Android native sheet', () => {
  it('fits its content up to Material’s widest sheet, opening fully', () => {
    runtime.window = { width: 900, height: 800 }
    render(AndroidNativeSheet)
    expect(find('ModalBottomSheet').props).toMatchObject({
      skipPartiallyExpanded: true,
      showDragHandle: true,
      sheetGesturesEnabled: true,
      properties: {
        shouldDismissOnBackPress: true,
        shouldDismissOnClickOutside: true,
      },
      containerColor: '#fff',
    })
    expect(find('RNHostView').props.matchContents).toBe(true)
    // 800 tall, 50 + 30 insets, and a 20dp handle band instead of Material's 48.
    expect(content()).toEqual({ width: 640, maxHeight: 700 })
    expect(find('Box').props.modifiers).toEqual([
      { padding: [0, 10, 0, 6] },
      { size: [32, 4] },
      { clip: { roundedCorner: 2 } },
      { background: '#999' },
    ])
  })

  it('opens halfway only for a snap point of half the screen or less', () => {
    render(AndroidNativeSheet, { snapPoints: ['half', 'full'] })
    expect(find('ModalBottomSheet').props.skipPartiallyExpanded).toBe(false)
    expect(find('Column').props.modifiers[0]).toEqual({ fillMaxSize: true })
    expect(content()).toEqual({ flex: 1 })

    render(AndroidNativeSheet, { snapPoints: [{ fraction: 0.85 }] })
    expect(find('ModalBottomSheet').props.skipPartiallyExpanded).toBe(true)

    render(AndroidNativeSheet, { snapPoints: [{ height: 300 }] })
    expect(find('ModalBottomSheet').props.skipPartiallyExpanded).toBe(false)
  })

  it('keeps Back, the scrim and dragging from dismissing it on request', () => {
    render(AndroidNativeSheet, { dismissible: false })
    expect(root.root.findAllByType('DragHandle' as never)).toHaveLength(0)
    expect(find('ModalBottomSheet').props).toMatchObject({
      showDragHandle: false,
      sheetGesturesEnabled: false,
      properties: {
        shouldDismissOnBackPress: false,
        shouldDismissOnClickOutside: false,
      },
    })
    find('ModalBottomSheet').props.onDismissRequest()
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('places popovers against where the sheet is on screen', () => {
    render(AndroidNativeSheet)
    expect(probe()).toEqual({ x: 20, y: 40, width: 10, height: 10 })
    const [positioned] = find('Column').props.modifiers
    act(() => positioned.onGloballyPositioned({ x: 0, y: 420 }))
    expect(probe()).toEqual({ x: 20, y: 460, width: 10, height: 10 })
  })

  it('says it has closed once the hide animation is over', async () => {
    render(AndroidNativeSheet)
    expect(runtime.hide).not.toHaveBeenCalled()
    let finishHiding = () => {}
    runtime.hide.mockReturnValue(
      new Promise<void>((resolve) => (finishHiding = resolve))
    )
    render(AndroidNativeSheet, { open: false })
    expect(runtime.hide).toHaveBeenCalledOnce()
    expect(onClosed).not.toHaveBeenCalled()
    await act(async () => finishHiding())
    expect(onClosed).toHaveBeenCalledOnce()
  })
})
