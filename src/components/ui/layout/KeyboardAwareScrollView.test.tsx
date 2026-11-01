import React, { useImperativeHandle } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

type Listener = (event: {
  endCoordinates: { screenY: number; height: number }
}) => void
type ScrollProps = {
  onScroll?: (event: { nativeEvent: { contentOffset: { y: number } } }) => void
  onFocus?: (event: object) => void
  onBlur?: (event: object) => void
  contentContainerStyle?: unknown
}

const runtime = vi.hoisted(() => ({
  platform: 'android',
  listeners: {} as Record<string, Listener>,

  field: { y: 0, height: 40 } as { y: number; height: number } | null,
  props: {} as ScrollProps,
  scrollToPosition: vi.fn(),
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
  Keyboard: {
    addListener: (name: string, listener: Listener) => {
      runtime.listeners[name] = listener
      return { remove: () => delete runtime.listeners[name] }
    },
  },
  StyleSheet: {
    flatten: (style: unknown) =>
      Array.isArray(style) ? Object.assign({}, ...style) : style,
  },
  TextInput: {
    State: {
      currentlyFocusedInput: () =>
        runtime.field && {
          measureInWindow: (
            callback: (x: number, y: number, w: number, h: number) => void
          ) => callback(0, runtime.field!.y, 300, runtime.field!.height),
        },
    },
  },
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 24 }),
}))
vi.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: ({
    ref,
    ...props
  }: ScrollProps & { ref?: React.Ref<unknown> }) => {
    runtime.props = props
    useImperativeHandle(ref, () => ({
      scrollToPosition: runtime.scrollToPosition,
    }))
    return null
  },
}))

import KeyboardAwareScrollView from './KeyboardAwareScrollView'

let renderer: ReactTestRenderer | undefined

const render = () =>
  act(() => {
    renderer = create(
      <KeyboardAwareScrollView contentContainerStyle={{ paddingBottom: 100 }} />
    )
  })

const scrollTo = (y: number) =>
  act(() => runtime.props.onScroll?.({ nativeEvent: { contentOffset: { y } } }))

const showKeyboard = () =>
  act(() =>
    runtime.listeners.keyboardDidShow({
      endCoordinates: { screenY: 500, height: 300 },
    })
  )

beforeEach(() => {
  runtime.platform = 'android'
  runtime.listeners = {}
  runtime.field = { y: 0, height: 40 }
  runtime.scrollToPosition.mockClear()
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    callback()
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.unstubAllGlobals()
})

it('scrolls a field the arriving keyboard covers just above it', () => {
  render()
  scrollTo(100)
  runtime.field = { y: 600, height: 40 }
  act(() => runtime.props.onFocus?.({}))
  expect(runtime.scrollToPosition).not.toHaveBeenCalled()

  showKeyboard()

  expect(runtime.scrollToPosition).toHaveBeenCalledWith(0, 256, true)
})

it('scrolls to a covered field the Next key moves focus to', () => {
  render()
  runtime.field = { y: 200, height: 40 }
  act(() => runtime.props.onFocus?.({}))
  showKeyboard()
  expect(runtime.scrollToPosition).not.toHaveBeenCalled()

  runtime.field = { y: 520, height: 40 }
  act(() => {
    runtime.props.onBlur?.({})
    runtime.props.onFocus?.({})
  })

  expect(runtime.scrollToPosition).toHaveBeenCalledWith(0, 76, true)
})

it("leaves the view alone when the focused field isn't in it", () => {
  render()
  runtime.field = { y: 600, height: 40 }
  showKeyboard()
  expect(runtime.scrollToPosition).not.toHaveBeenCalled()
})

it('keeps room for the keyboard and nav bar under the content only while it is up', () => {
  render()
  const paddingBottom = () =>
    (
      [runtime.props.contentContainerStyle].flat(Infinity).filter(Boolean) as {
        paddingBottom?: number
      }[]
    ).reduce((last, style) => style.paddingBottom ?? last, 0)
  expect(paddingBottom()).toBe(100)

  showKeyboard()
  expect(paddingBottom()).toBe(100 + 300 + 24)

  act(() =>
    runtime.listeners.keyboardDidHide({
      endCoordinates: { screenY: 800, height: 0 },
    })
  )
  expect(paddingBottom()).toBe(100)
})

it("passes iOS through to the library's view", () => {
  runtime.platform = 'ios'
  render()
  expect(runtime.props.onFocus).toBeUndefined()
  expect(runtime.listeners).toEqual({})
})
